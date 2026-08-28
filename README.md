# BetterReadAll

A BetterDiscord plugin that clears every unread channel across every server with a single held keystroke.

Discord's built-in "Mark as read" only applies to one server at a time, and the server list has no bulk equivalent. BetterReadAll walks every guild you are in, collects the channels that are actually unread, and acknowledges them in one pass.

## Usage

Hold **Shift + Escape** for three seconds anywhere in the client. A toast appears with a countdown ring; releasing either key before it completes cancels the action. Once the countdown finishes, every unread channel is marked as read and the toast reports how many channels across how many servers were cleared.

The hold requirement is deliberate. Marking everything as read is not reversible, so a tap of the shortcut should never trigger it.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| Hold Duration | 3s | How long Shift+Escape must be held before clearing. Range 1 to 5 seconds. |
| Show Progress Toast | On | Whether to display the countdown ring and status toast. |

## Installation

1. Download `BetterReadAll.plugin.js`.
2. Move it into your BetterDiscord plugins folder:
   - Windows: `%AppData%\BetterDiscord\plugins`
   - macOS: `~/Library/Application Support/BetterDiscord/plugins`
   - Linux: `~/.config/BetterDiscord/plugins`
3. Enable the plugin under User Settings > Plugins.

## How it works

Channels are gathered from `GuildChannelStore` and filtered against `ReadStateStore.hasUnread`, so only channels with genuine unread state are included. Those are sent to Discord's own bulk acknowledge action in batches of 100 rather than as one unbounded request.

Completion is confirmed by re-checking the affected channels against `ReadStateStore` every 50 milliseconds until none report unread, which normally resolves within a frame or two of the acknowledge landing. If the state has not settled after 2.5 seconds the toast says so instead of reporting a success that has not happened.

Everything the plugin adds is removed on disable: both key listeners, the blur and visibility listeners, all pending timers, the injected stylesheet, and the toast element.

## Compatibility

Requires BetterDiscord and uses only the official `BdApi` surface. No Discord internals are patched and no requests are made beyond the acknowledge action the client already performs when you read a channel.

Module lookup depends on Discord's current bundle. If a future Discord update renames the read state modules, the plugin will report the failure on enable rather than silently doing nothing.

## License

MIT. See [LICENSE](LICENSE).
