'use client';

import { useEffect } from 'react';
import { storeOfflineRecipeSnapshot } from '../lib/offline/cache-client';
import { isOfflineRecipePath } from '../lib/offline/cache-rules';

function createOfflineSnapshot(recipeId: string) {
  const path = window.location.pathname;
  if (path !== `/recipes/${recipeId}` || !isOfflineRecipePath(path)) return null;

  const sourceMain = document.querySelector('main.recipes-main');
  const title = sourceMain?.querySelector('h1')?.textContent?.trim();
  if (!sourceMain || !title) return null;

  const styles = Array.from(
    document.querySelectorAll<HTMLLinkElement>('head link[rel="stylesheet"]'),
  )
    .map((link) => new URL(link.href, window.location.origin))
    .filter(
      (url) =>
        url.origin === window.location.origin &&
        url.pathname.startsWith('/_next/static/') &&
        url.pathname.endsWith('.css'),
    )
    .map((url) => `${url.pathname}${url.search}`);
  const stylesheetRules = Array.from(document.styleSheets)
    .filter(
      (stylesheet) =>
        !stylesheet.href ||
        new URL(stylesheet.href, window.location.origin).origin === window.location.origin,
    )
    .map((stylesheet) =>
      Array.from(stylesheet.cssRules)
        .filter((rule) => rule.type !== CSSRule.IMPORT_RULE)
        .map((rule) =>
          rule.cssText.replace(
            /url\((['"]?)(.*?)\1\)/gi,
            (match, _quote: string, assetPath: string) => {
              if (!assetPath || assetPath.startsWith('data:') || assetPath.startsWith('#')) {
                return match;
              }
              return `url("${new URL(assetPath, stylesheet.href ?? document.baseURI)}")`;
            },
          ),
        )
        .join('\n'),
    )
    .join('\n');
  const offlineDocument = document.implementation.createHTMLDocument(title);
  offlineDocument.documentElement.lang = 'en';
  const style = offlineDocument.createElement('style');
  style.textContent = stylesheetRules;
  offlineDocument.head.append(style);
  const viewport = offlineDocument.createElement('meta');
  viewport.name = 'viewport';
  viewport.content = 'width=device-width, initial-scale=1';
  offlineDocument.head.append(viewport);

  const content = offlineDocument.createElement('div');
  content.className = 'private-content private-content-wide';
  const status = offlineDocument.createElement('p');
  status.className = 'offline-page-status';
  status.setAttribute('role', 'status');
  status.textContent = 'Offline copy. This saved recipe may be out of date.';
  content.append(status);

  const main = offlineDocument.importNode(sourceMain, true);
  main
    .querySelectorAll(
      'script,style,form,input,select,textarea,img,image,picture,source,video,audio,iframe,object,embed,nav,.recipe-detail-heading-actions,.recipe-history-link,.recipe-screen-only',
    )
    .forEach((element) => {
      element.remove();
    });
  main.querySelectorAll('button').forEach((button) => {
    if (button.textContent?.trim()) {
      button.replaceWith(...Array.from(button.childNodes));
    } else {
      button.remove();
    }
  });
  main.querySelectorAll('a').forEach((link) => {
    link.replaceWith(...Array.from(link.childNodes));
  });
  content.append(main);
  offlineDocument.body.append(content);

  return {
    path,
    title,
    styles,
    html: `<!doctype html>${offlineDocument.documentElement.outerHTML}`,
  };
}

async function waitForController() {
  if (!('serviceWorker' in navigator)) return false;
  const registration = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 3000)),
  ]);
  if (!registration) return false;
  if (navigator.serviceWorker.controller) return true;

  return new Promise<boolean>((resolve) => {
    const timeout = window.setTimeout(() => resolve(false), 1500);
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => {
        window.clearTimeout(timeout);
        resolve(Boolean(navigator.serviceWorker.controller));
      },
      { once: true },
    );
  });
}

export function OfflineSnapshotCapture({ recipeId }: { recipeId: string }) {
  useEffect(() => {
    let cancelled = false;

    async function capture() {
      try {
        if (!(await waitForController()) || cancelled || !('caches' in window)) return;
        const snapshot = createOfflineSnapshot(recipeId);
        if (!snapshot || cancelled) return;

        await Promise.all(
          snapshot.styles.map((stylePath) =>
            fetch(stylePath, { cache: 'reload' }).catch(() => null),
          ),
        );
        if (cancelled) return;
        await storeOfflineRecipeSnapshot(
          {
            path: snapshot.path,
            title: snapshot.title,
            viewedAt: Date.now(),
            styles: snapshot.styles,
          },
          snapshot.html,
        );
      } catch {
        // Offline caching is optional and must not affect recipe reading.
      }
    }

    void capture();
    return () => {
      cancelled = true;
    };
  }, [recipeId]);

  return null;
}
