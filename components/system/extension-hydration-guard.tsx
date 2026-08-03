import Script from "next/script"

/**
 * Một số browser extension chèn thuộc tính vào HTML trước khi React hydrate.
 *
 * Ví dụ đang xuất hiện trong project:
 * bis_skin_checked="1"
 *
 * Component này chỉ chạy trong development.
 * Production không tải script này.
 */
const extensionCleanupScript = String.raw`
(() => {
  const EXTENSION_ATTRIBUTES = [
    "bis_skin_checked"
  ];

  function removeExtensionAttributes(element) {
    if (!(element instanceof Element)) {
      return;
    }

    for (const attribute of EXTENSION_ATTRIBUTES) {
      if (element.hasAttribute(attribute)) {
        element.removeAttribute(attribute);
      }
    }
  }

  function cleanTree(root) {
    if (!root) {
      return;
    }

    if (root instanceof Element) {
      removeExtensionAttributes(root);
    }

    if (
      root instanceof Document ||
      root instanceof DocumentFragment ||
      root instanceof Element
    ) {
      const selector = EXTENSION_ATTRIBUTES
        .map((attribute) => "[" + attribute + "]")
        .join(",");

      if (!selector) {
        return;
      }

      root
        .querySelectorAll(selector)
        .forEach(removeExtensionAttributes);
    }
  }

  function startExtensionGuard() {
    cleanTree(document);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (
          mutation.type === "attributes" &&
          mutation.target instanceof Element
        ) {
          removeExtensionAttributes(mutation.target);
        }

        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            if (
              node instanceof Element ||
              node instanceof DocumentFragment
            ) {
              cleanTree(node);
            }
          });
        }
      }
    });

    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: EXTENSION_ATTRIBUTES
    });

    /*
     * Chỉ cần theo dõi trong giai đoạn React hydrate.
     * Sau 15 giây dừng observer để tránh chạy không cần thiết.
     */
    window.setTimeout(() => {
      cleanTree(document);
      observer.disconnect();
    }, 15000);
  }

  if (document.documentElement) {
    startExtensionGuard();
  } else {
    document.addEventListener(
      "DOMContentLoaded",
      startExtensionGuard,
      { once: true }
    );
  }
})();
`

export function ExtensionHydrationGuard() {
  if (process.env.NODE_ENV !== "development") {
    return null
  }

  return (
    <Script
      id="extension-hydration-guard"
      strategy="beforeInteractive"
    >
      {extensionCleanupScript}
    </Script>
  )
}