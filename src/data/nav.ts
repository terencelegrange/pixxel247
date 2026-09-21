/**
 * Navigation item definitions.
 *
 * INSTRUCTIONS FOR CLAUDE:
 * When you add a new page/route that should appear in the sidebar:
 * 1. Add it here with a unique `key`, `href`, `label`, and `icon`
 * 2. Add default role permissions in `initDb.ts` → role_permissions seed block
 *    (decide which roles should have access: viewer, editor, admin)
 * 3. Update `src/app/api/openapi/route.ts` for any new API routes
 * 4. Add a changelog entry in `src/data/changelog.ts`
 */

export interface NavItem {
  key: string;
  href: string;
  label: string;
  icon: string; // SVG path d= attribute
  section?: string; // renders a group heading above this item
}

export const NAV_ITEMS: NavItem[] = [
  {
    key: "dashboard",
    href: "/",
    label: "Dashboard",
    icon: "M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z",
  },
  {
    key: "assets",
    href: "/assets",
    label: "Assets",
    icon: "M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 3.75c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125",
  },
  {
    key: "business-services",
    href: "/services",
    label: "Business Services",
    icon: "M6.429 9.75L2.25 12l4.179 2.25m0-4.5L12 12.75l5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0L12 17.25l-5.571-3m11.142 0l4.179 2.25L12 21.75 2.25 16.5l4.179-2.25",
  },
  {
    key: "verification",
    href: "/verify",
    label: "Live Verification",
    icon: "M9 12.75l2.25 2.25L15 9.75m6-3.75a12.83 12.83 0 01-9 3 12.83 12.83 0 01-9-3c0 5.591 3.824 10.29 9 11.622C17.176 16.29 21 11.59 21 6z",
  },
  {
    key: "settings",
    href: "/settings",
    label: "Settings",
    section: "Configuration",
    icon: "M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  },
];

/** Role definitions — display order and labels */
export const ROLES = [
  { key: "viewer", label: "Viewer",  description: "Read-only access to permitted pages" },
  { key: "editor", label: "Editor",  description: "Can view and edit content" },
  { key: "admin",  label: "Admin",   description: "Full access including user management and settings" },
];

/** Default permissions: which nav keys each role can access */
export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  viewer: ["dashboard", "assets", "business-services", "verification"],
  editor: ["dashboard", "assets", "business-services", "verification"],
  admin:  ["dashboard", "assets", "business-services", "verification", "settings"],
};
