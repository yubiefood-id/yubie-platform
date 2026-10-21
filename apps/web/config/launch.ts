import { parseLaunchProfile } from "@yubie/config/launch";

// Public, immutable build selection. Changing a server-only environment value
// cannot make an already-reviewed static catalog acquire checkout capabilities.
export const launchProfile = parseLaunchProfile(process.env.NEXT_PUBLIC_YUBIE_LAUNCH_PROFILE);
export const directCommerce = launchProfile === "DIRECT_COMMERCE_SANDBOX";
