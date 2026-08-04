export const brandTokens = {
  purple: "#6417A8",
  green: "#197A32",
  gold: "#D9A72E",
  white: "#FFFDF7",
  ink: "#24152E",
} as const;

export type BrandToken = keyof typeof brandTokens;
