/**
 * Plays an HTML string through a hidden iframe's native print dialog.
 *
 * Extracted verbatim from the copy inside generateJobOrderPayroll.ts (which in
 * turn matches generatePayroll.ts) so new printables do not add a third copy.
 * The two existing copies are left where they are — they are working, printed
 * government forms, and rewiring them is not worth the regression risk.
 *
 * The timing dance is load-bearing: `iframe.onload` does not fire reliably for
 * a document written with `document.write` in every browser, so a 1s fallback
 * timer arms the print as well, guarded by `hasPrinted` so only one of the two
 * wins. Cleanup runs on `afterprint`, with a 5s backstop for browsers that
 * never fire it (the print dialog is modal, so the timer only starts once
 * `print()` returns).
 */
export function printHTMLContent(htmlContent: string): void {
  if (typeof document === "undefined") return;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "none";
  document.body.appendChild(iframe);

  let isCleanedUp = false;
  let cleanupTimeout: ReturnType<typeof setTimeout> | null = null;
  let afterPrintHandler: (() => void) | null = null;

  const cleanup = () => {
    if (isCleanedUp) return;
    isCleanedUp = true;
    try {
      if (cleanupTimeout) {
        clearTimeout(cleanupTimeout);
        cleanupTimeout = null;
      }
      if (afterPrintHandler && iframe.contentWindow) {
        try {
          iframe.contentWindow.removeEventListener(
            "afterprint",
            afterPrintHandler,
          );
        } catch {
          // ignore
        }
      }
      if (iframe.parentNode) {
        document.body.removeChild(iframe);
      }
    } catch {
      // ignore
    }
  };

  const printIframe = () => {
    if (isCleanedUp) return;
    try {
      if (!iframe.contentWindow || !iframe.parentNode) {
        cleanup();
        return;
      }
      cleanupTimeout = setTimeout(cleanup, 5000);
      afterPrintHandler = () => {
        if (cleanupTimeout) {
          clearTimeout(cleanupTimeout);
          cleanupTimeout = null;
        }
        cleanup();
      };
      try {
        iframe.contentWindow.addEventListener("afterprint", afterPrintHandler, {
          once: true,
        });
        iframe.contentWindow.print();
      } catch {
        cleanup();
      }
    } catch {
      cleanup();
    }
  };

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc) {
    cleanup();
    return;
  }
  try {
    iframeDoc.open();
    iframeDoc.write(htmlContent);
    iframeDoc.close();

    let hasPrinted = false;
    iframe.onload = () => {
      setTimeout(() => {
        if (
          !hasPrinted &&
          !isCleanedUp &&
          iframe.contentWindow &&
          iframe.parentNode
        ) {
          hasPrinted = true;
          printIframe();
        }
      }, 250);
    };
    setTimeout(() => {
      if (
        !hasPrinted &&
        !isCleanedUp &&
        iframe.parentNode &&
        iframe.contentWindow
      ) {
        hasPrinted = true;
        printIframe();
      }
    }, 1000);
  } catch {
    cleanup();
  }
}
