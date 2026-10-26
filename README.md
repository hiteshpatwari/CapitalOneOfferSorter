# Capital One Offers Miles Sorter

Sort the Capital One Offers feed by the value that matters to you. The extension supports highest miles, lowest miles, highest X multiples, and original order.

## Features

- Sorts offer tiles by plain mile values such as `5,000 miles`.
- Sorts explicit multipliers such as `20X miles` and `98X miles`.
- Keeps larger showcase, hero, and carousel tiles in their original positions.
- Remembers the selected default sort and whether automatic sorting is enabled.
- Works in Chromium browsers, including Google Chrome and Microsoft Edge.

The extension is an independent utility and is not affiliated with or endorsed by Capital One.

## Load it

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable developer mode.
3. If a full-screen table or yellow `Show list` button is visible, disable the other sorter extension or userscript that created it.
4. Click `Load unpacked`.
5. Select this folder.
6. Refresh the Capital One Offers page.

## Notes

- The extension only declares `storage` and `https://capitaloneoffers.com/*` permissions.
- It stores only `defaultSort` and `autoSort` preferences.
- It does not send offer data to an external server.
