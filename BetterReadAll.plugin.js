/**
 * @name BetterReadAll
 * @author Zyhloh
 * @description Hold Shift+Escape anywhere to mark every unread channel as read and clear all notifications.
 * @version 1.0.0
 * @source https://github.com/Zyhloh/BetterReadAll/blob/main/BetterReadAll.plugin.js
 */

const { Webpack, Data, UI, DOM, Logger } = new BdApi("BetterReadAll");

const RING = 2 * Math.PI * 9;
const ACK_BATCH_SIZE = 100;
const CONFIRM_POLL_MS = 50;
const CONFIRM_TIMEOUT_MS = 2500;

const DEFAULT_SETTINGS = {
    holdSeconds: 3,
    showToast: true
};

const STYLES = `
.bra-toast {
    position: fixed;
    left: 50%;
    bottom: 40px;
    z-index: 2147483647;
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 11px 17px 11px 13px;
    border-radius: 12px;
    pointer-events: none;
    background: var(--background-floating, var(--background-secondary-alt, #1e1f22));
    color: var(--text-normal, #dbdee1);
    box-shadow: var(--shadow-high, 0 8px 24px rgba(0, 0, 0, .32));
    border: 1px solid var(--border-subtle, rgba(255, 255, 255, .06));
    font-family: var(--font-primary, "gg sans", "Noto Sans", sans-serif);
    font-size: 14px;
    font-weight: 500;
    line-height: 1.2;
    opacity: 0;
    transform: translateX(-50%) translateY(8px) scale(.97);
    transition: opacity .16s ease, transform .16s cubic-bezier(.2, .9, .3, 1.2);
}

.bra-toast[data-open="true"] {
    opacity: 1;
    transform: translateX(-50%) translateY(0) scale(1);
}

.bra-icon {
    position: relative;
    flex: none;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.bra-ring {
    position: absolute;
    inset: 0;
    transform: rotate(-90deg);
}

.bra-ring circle {
    fill: none;
    stroke-width: 2;
    stroke-linecap: round;
}

.bra-track {
    stroke: var(--border-strong, rgba(255, 255, 255, .12));
}

.bra-bar {
    stroke: var(--brand-500, var(--text-brand, #5865f2));
    stroke-dasharray: ${RING};
    stroke-dashoffset: ${RING};
}

.bra-toast[data-state="busy"] .bra-ring {
    animation: bra-spin .75s linear infinite;
}

.bra-toast[data-state="busy"] .bra-bar {
    stroke-dashoffset: ${RING * 0.75};
}

.bra-toast[data-state="done"] .bra-ring,
.bra-toast[data-state="failed"] .bra-ring {
    opacity: 0;
}

.bra-check {
    position: absolute;
    width: 20px;
    height: 20px;
    color: var(--status-positive, var(--green-360, #23a55a));
    opacity: 0;
    transform: scale(.4);
    transition: opacity .18s ease, transform .18s cubic-bezier(.2, .9, .3, 1.5);
}

.bra-toast[data-state="failed"] .bra-check {
    color: var(--status-danger, var(--red-400, #f23f43));
}

.bra-toast[data-state="done"] .bra-check,
.bra-toast[data-state="failed"] .bra-check {
    opacity: 1;
    transform: scale(1);
}

.bra-count {
    flex: none;
    min-width: 16px;
    text-align: center;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    color: var(--text-muted, #949ba4);
}

.bra-toast:not([data-state="hold"]) .bra-count {
    display: none;
}

@keyframes bra-spin {
    to { transform: rotate(270deg); }
}

@media (prefers-reduced-motion: reduce) {
    .bra-toast,
    .bra-bar,
    .bra-check {
        transition: none;
    }

    .bra-toast[data-state="busy"] .bra-ring {
        animation: none;
    }
}
`;

const TOAST_MARKUP = `
<div class="bra-icon">
    <svg class="bra-ring" viewBox="0 0 20 20" aria-hidden="true">
        <circle class="bra-track" cx="10" cy="10" r="9"></circle>
        <circle class="bra-bar" cx="10" cy="10" r="9"></circle>
    </svg>
    <svg class="bra-check" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M20 6.5 9.5 17 4 11.5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path>
    </svg>
</div>
<span class="bra-text"></span>
<span class="bra-count"></span>
`;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

class Toast {
    constructor() {
        this.element = null;
        this.bar = null;
        this.text = null;
        this.count = null;
        this.hideTimer = null;
    }

    mount() {
        if (this.element) return;

        this.element = document.createElement("div");
        this.element.className = "bra-toast";
        this.element.setAttribute("role", "status");
        this.element.setAttribute("aria-live", "polite");
        this.element.innerHTML = TOAST_MARKUP;
        document.body.appendChild(this.element);

        this.bar = this.element.querySelector(".bra-bar");
        this.text = this.element.querySelector(".bra-text");
        this.count = this.element.querySelector(".bra-count");
    }

    show(state, message, count) {
        this.mount();
        clearTimeout(this.hideTimer);

        this.text.textContent = message;
        this.count.textContent = count == null ? "" : String(count);
        this.element.dataset.state = state;
        this.element.dataset.open = "true";
    }

    setCount(value) {
        if (this.count) this.count.textContent = String(value);
    }

    setProgress(fraction, seconds) {
        if (!this.bar) return;

        this.bar.style.transition = seconds ? `stroke-dashoffset ${seconds}s linear` : "none";
        this.bar.style.strokeDashoffset = String(RING * (1 - fraction));
    }

    hide(delay = 0) {
        clearTimeout(this.hideTimer);
        this.hideTimer = setTimeout(() => {
            if (this.element) this.element.dataset.open = "false";
        }, delay);
    }

    destroy() {
        clearTimeout(this.hideTimer);
        this.element?.remove();
        this.element = null;
        this.bar = null;
        this.text = null;
        this.count = null;
    }
}

module.exports = class BetterReadAll {
    constructor(meta) {
        this.meta = meta;
        this.settings = Object.assign({}, DEFAULT_SETTINGS, Data.load("settings"));

        this.toast = new Toast();
        this.held = { shift: false, escape: false };
        this.holdTimer = null;
        this.countdownTimer = null;
        this.releaseTimer = null;
        this.holding = false;
        this.spent = false;
        this.busy = false;

        this.onKeyDown = this.onKeyDown.bind(this);
        this.onKeyUp = this.onKeyUp.bind(this);
        this.onBlur = this.onBlur.bind(this);
        this.onVisibilityChange = this.onVisibilityChange.bind(this);
    }

    start() {
        if (!this.resolveModules()) {
            UI.showToast("BetterReadAll could not resolve Discord's read state modules.", { type: "error" });
            return;
        }

        DOM.addStyle(STYLES);

        window.addEventListener("keydown", this.onKeyDown, true);
        window.addEventListener("keyup", this.onKeyUp, true);
        window.addEventListener("blur", this.onBlur);
        document.addEventListener("visibilitychange", this.onVisibilityChange);
    }

    stop() {
        window.removeEventListener("keydown", this.onKeyDown, true);
        window.removeEventListener("keyup", this.onKeyUp, true);
        window.removeEventListener("blur", this.onBlur);
        document.removeEventListener("visibilitychange", this.onVisibilityChange);

        clearTimeout(this.holdTimer);
        clearTimeout(this.releaseTimer);
        clearInterval(this.countdownTimer);

        this.holding = false;
        this.spent = false;
        this.busy = false;

        this.toast.destroy();
        DOM.removeStyle();
    }

    resolveModules() {
        this.GuildStore = Webpack.getStore("GuildStore");
        this.GuildChannelStore = Webpack.getStore("GuildChannelStore");
        this.ReadStateStore = Webpack.getStore("ReadStateStore");
        this.bulkAck = Webpack.getModule(Webpack.Filters.byStrings("BULK_ACK"), { searchExports: true });

        const missing = Object.entries({
            GuildStore: this.GuildStore,
            GuildChannelStore: this.GuildChannelStore,
            ReadStateStore: this.ReadStateStore,
            bulkAck: this.bulkAck
        })
            .filter(([, value]) => !value)
            .map(([name]) => name);

        if (missing.length) {
            Logger.error(`Unable to resolve: ${missing.join(", ")}`);
            return false;
        }

        return true;
    }

    hasUnread(channelId) {
        try {
            return this.ReadStateStore.hasUnread(channelId);
        }
        catch {
            return false;
        }
    }

    collectUnread() {
        const guilds = this.GuildStore.getGuilds();
        const states = [];
        let guildCount = 0;

        for (const guildId in guilds) {
            const groups = this.GuildChannelStore.getChannels(guildId);
            if (!groups) continue;

            const before = states.length;

            for (const key in groups) {
                const bucket = groups[key];
                if (!Array.isArray(bucket)) continue;

                for (const entry of bucket) {
                    const channel = entry?.channel ?? entry;
                    if (!channel?.id || !this.hasUnread(channel.id)) continue;

                    const messageId = this.ReadStateStore.lastMessageId(channel.id);
                    if (messageId == null) continue;

                    states.push({ channelId: channel.id, messageId, readStateType: 0 });
                }
            }

            if (states.length > before) guildCount += 1;
        }

        return { states, guildCount };
    }

    dispatchAck(states) {
        for (let index = 0; index < states.length; index += ACK_BATCH_SIZE) {
            this.bulkAck(states.slice(index, index + ACK_BATCH_SIZE));
        }
    }

    async confirmCleared(states) {
        let pending = states.map(state => state.channelId);
        const deadline = Date.now() + CONFIRM_TIMEOUT_MS;

        while (Date.now() < deadline) {
            pending = pending.filter(channelId => this.hasUnread(channelId));
            if (!pending.length) return true;

            await sleep(CONFIRM_POLL_MS);
        }

        return false;
    }

    async clearAll() {
        const { states, guildCount } = this.collectUnread();

        if (!states.length) {
            this.toast.show("done", "Nothing to clear");
            this.release(1800);
            return;
        }

        this.toast.show("busy", `Clearing ${plural(states.length, "channel")}...`);

        try {
            this.dispatchAck(states);
        }
        catch (error) {
            Logger.error("Bulk acknowledge failed", error);
            this.toast.show("failed", "Failed to clear notifications");
            this.release(2600);
            return;
        }

        const cleared = await this.confirmCleared(states);
        const summary = `Cleared ${plural(states.length, "channel")} across ${plural(guildCount, "server")}`;

        this.toast.show(cleared ? "done" : "busy", cleared ? summary : `${summary}, still syncing`);
        this.release(2600);
    }

    beginHold() {
        if (this.holding || this.spent || this.busy) return;

        this.holding = true;

        const seconds = this.settings.holdSeconds;
        let remaining = seconds;

        if (this.settings.showToast) {
            this.toast.show("hold", "Hold to clear all notifications", remaining);
            this.toast.setProgress(0, 0);
            requestAnimationFrame(() => {
                if (this.holding) this.toast.setProgress(1, seconds);
            });
        }

        this.countdownTimer = setInterval(() => {
            remaining -= 1;
            if (remaining > 0) this.toast.setCount(remaining);
        }, 1000);

        this.holdTimer = setTimeout(() => {
            clearInterval(this.countdownTimer);
            this.holding = false;
            this.spent = true;
            this.busy = true;
            this.clearAll();
        }, seconds * 1000);
    }

    cancelHold() {
        if (!this.holding) return;

        this.holding = false;
        clearTimeout(this.holdTimer);
        clearInterval(this.countdownTimer);
        this.toast.setProgress(0, 0);
        this.toast.hide(0);
    }

    release(delay) {
        this.toast.hide(delay);
        clearTimeout(this.releaseTimer);
        this.releaseTimer = setTimeout(() => {
            this.busy = false;
        }, delay + 250);
    }

    reset() {
        this.held.shift = false;
        this.held.escape = false;
        this.spent = false;
        this.cancelHold();
    }

    onKeyDown(event) {
        if (event.shiftKey || event.key === "Shift") this.held.shift = true;

        const escape = event.key === "Escape" || event.code === "Escape";
        if (escape) this.held.escape = true;

        if (!this.held.shift || !this.held.escape) return;

        if (escape) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }

        this.beginHold();
    }

    onKeyUp(event) {
        if (!event.shiftKey || event.key === "Shift") this.held.shift = false;
        if (event.key === "Escape" || event.code === "Escape") this.held.escape = false;

        if (this.held.shift && this.held.escape) return;

        this.spent = false;
        this.cancelHold();
    }

    onBlur(event) {
        if (event.target === window) this.reset();
    }

    onVisibilityChange() {
        if (document.visibilityState !== "visible") this.reset();
    }

    getSettingsPanel() {
        return UI.buildSettingsPanel({
            settings: [
                {
                    type: "slider",
                    id: "holdSeconds",
                    name: "Hold Duration",
                    note: "How long Shift+Escape must be held before notifications are cleared.",
                    min: 1,
                    max: 5,
                    step: 1,
                    units: "s",
                    markers: [1, 2, 3, 4, 5],
                    value: this.settings.holdSeconds
                },
                {
                    type: "switch",
                    id: "showToast",
                    name: "Show Progress Toast",
                    note: "Display the countdown ring and status toast while clearing.",
                    value: this.settings.showToast
                }
            ],
            onChange: (_category, id, value) => {
                this.settings[id] = id === "holdSeconds" ? Math.round(value) : value;
                Data.save("settings", this.settings);
            }
        });
    }
};
