// The last mock data in the app, and the only thing still reading it is the
// tap history on frontend/src/pages/app/Card.jsx. Nothing records an NFC tap
// anywhere — there is no endpoint, no table, no column — so every number that
// screen shows about taps is invented.
//
// This file used to also export `businesses`, `activity`, `getBusiness` and
// `introductions`. All four went in Aug 2026: the first three had already
// been replaced by real API calls, and `introductions` went with the screen
// it fed, which was deleted for being mock end to end. That deletion is what
// left this file down to one export — worth knowing, because it means the
// tap counts are now the single remaining place the app shows a member a
// figure it made up.
//
// Delete this file the moment taps are recorded for real. Until then, don't
// add to it: a second consumer is how the previous four exports survived long
// after the screens behind them had gone real.
export const nfcTaps = [
  { id: "t1", location: "Menara KLK, Damansara", device: "iPhone 15", date: "Today, 3:42pm", ledToProfileView: true },
  { id: "t2", location: "Bangsar Village, KL", device: "Pixel 8", date: "Today, 11:20am", ledToProfileView: true },
  { id: "t3", location: "KLCC, KL", device: "iPhone 14", date: "Yesterday, 5:10pm", ledToProfileView: false },
  { id: "t4", location: "One Utama, PJ", device: "Samsung S24", date: "2 days ago", ledToProfileView: true },
  { id: "t5", location: "The Gardens Mall, KL", device: "iPhone 15 Pro", date: "3 days ago", ledToProfileView: true },
  { id: "t6", location: "Publika, Solaris Dutamas", device: "iPhone 13", date: "4 days ago", ledToProfileView: false },
];
