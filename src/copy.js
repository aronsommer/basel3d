// Copies text to the clipboard, resolving whether it did: by navigator.clipboard where the page may
// use it (https, localhost), else by selecting the text in a hidden field for the old
// execCommand("copy"), which works over plain http too (as on a phone reaching a dev server), but
// only while handling a click, tap or key.
export function copy(text) {
  if (navigator.clipboard)
    return navigator.clipboard.writeText(text).then(
      () => true,
      () => false,
    );
  const field = Object.assign(document.createElement("textarea"), { value: text, readOnly: true });
  field.style.cssText = "position: fixed; top: 0; left: 0; opacity: 0; font-size: 16px";
  document.body.append(field);
  field.select();
  field.setSelectionRange(0, text.length); // Safari on iOS
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {} // not supported
  field.remove();
  return Promise.resolve(copied);
}
