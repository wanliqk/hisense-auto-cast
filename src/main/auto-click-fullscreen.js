module.exports = (webContents, selector) => webContents.executeJavaScript(
  `(() => {
    const button = document.querySelector(${JSON.stringify(selector)});
    if (!button) return false;
    button.click();
    return true;
  })()`,
  true
);
