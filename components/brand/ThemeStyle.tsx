import { DEFAULT_BODY, DEFAULT_DISPLAY, googleFontUrl, themeCss, type ThemeInput } from "@/lib/brand";

/** Applies the owner's colours and fonts. Values are validated in lib/brand. */
export function ThemeStyle({ theme }: { theme: ThemeInput }) {
  const fonts = [googleFontUrl(theme.font_display, DEFAULT_DISPLAY), googleFontUrl(theme.font_body, DEFAULT_BODY)].filter(
    (u): u is string => Boolean(u),
  );
  const css = themeCss(theme);
  return (
    <>
      {fonts.map((href) => (
        <link key={href} rel="stylesheet" href={href} precedence="default" />
      ))}
      {/* href keys the hoisted style: a new theme gets a new key so it replaces the old CSS */}
      <style precedence="default" href={`theme-${hash(css)}`}>
        {css}
      </style>
    </>
  );
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
