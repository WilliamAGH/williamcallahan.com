/**
 * Shared OG Image Branding Footer
 * @module lib/og-image/layouts/shared-branding
 * @description
 * Renders the "williamcallahan.com" branding footer used across all OG image layouts.
 */

import { OG_COLORS, OG_LAYOUT, OG_TYPOGRAPHY } from "../design-tokens";

/**
 * Site favicon as a base64-encoded 16×16 PNG data URL.
 * Source: /public/favicon.ico converted via `base64` CLI.
 * Regenerate: `cat public/favicon.ico | base64 | pbcopy`, then wrap as data URL.
 */
const SITE_FAVICON_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAADEUlEQVQ4yzXTS28bVRiA4fecOXOxx3YcV06bS62QLqoQBAixQKICgcQCkFgg9mxgjfg7SOyoWLFACKQuIkAtiIZUkEak5NIm+NKkie3EjmfGc/1YIJ7/8KhPvvhGCgHF/wRQaMcletYmm1xAaQZ/bhFB40hMqwaHI0WSK4zSmvdaCUEq3Dt2sbWgjM1w+x7h/W+Jkwzf9znSVZpvfsQ7r7V4oTrmTtujFxjMSj1nyc+4mOYsVxWhmeHJg195I9ni/c8+JIpTGr7DD+sbfHXnS1q3Pucs1KzWp8y4NvpmPeU0yDlPLVq1jDk/pWGnfPD6GteuzHC1XqZeLfPizWUmFyPW98f0Mp/u1CFSBtMJDZlVQo/7pNrBaRiuLy9w9+HPrN1IQYRfHh5y1dPMN+tYfpVQDIFSaONgFmqKMMtIB09InAqzSw1MpcAyirPzS+YrLldmq5RVzrsrMxgZI+4csxZMgj7mqDOg7mvckodNThDFuMbj7dXrjCcxve4pt55f5vi4T69fw/g+eQGD3jbbP91GffzpW2L8JRaNQpQQ+g28acBqcYLreViOSx5HHHTOuFhYoTY/T38c0z/eYdA7QkdRj/3OLkURI7ZmWqsy8Xy2sxpzjQqtZoXMsklTYfP+Nu2Dx9SSPi4GbWv0JCkRXkbsjvqMKk3yPOL0ssv65i4bh2O2Dk8Jh+c812zQ7QXc/fEP7EKo+ynDQYFRYjHfdBgGY5K9Tco65K8HT0mmHs2Sy8sLmt//Fm4/uiAqpsSjnK+/32TtpRrX5gzGK1l4ZZtFD4bjiJ2tABEPjOHxacg0L/HdXsbx8ASDoF1DOInZ+XPAK686mBsrOUaEsu3S2w/I4xRtCb5rcR6WODiLCcJnjIIxtu1SdW2MpZhOczZ+i9HlpETDOESTiMNOhLYEEUUQR/iOoVmG7uCEkutRLTkoIMsKlAVJIhiciG6Us9cW0rTAsRVFIWgFj552ODnvYywLoxWIkGYZhQiFgIhg2iNQ2hCPEooCBEEpMNrin36PohBsy/ovughhnOLZBhGwtOJfn6mAzhymZdoAAAAASUVORK5CYII=";

/** Renders the site branding footer element for OG images */
export function renderBranding() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 10,
        marginTop: 16,
      }}
    >
      <img
        src={SITE_FAVICON_DATA_URL}
        alt=""
        style={{
          width: OG_LAYOUT.faviconSize,
          height: OG_LAYOUT.faviconSize,
          borderRadius: OG_LAYOUT.faviconBorderRadius,
        }}
      />
      <span
        style={{
          fontSize: OG_TYPOGRAPHY.branding.size,
          fontWeight: OG_TYPOGRAPHY.branding.weight,
          color: OG_COLORS.textMuted,
        }}
      >
        williamcallahan.com
      </span>
    </div>
  );
}
