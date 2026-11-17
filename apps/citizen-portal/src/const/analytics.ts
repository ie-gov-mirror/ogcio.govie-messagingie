/**
 * Matomo event catalogue for citizen-portal.
 * Mirrors apps/public-servant-portal/src/const/analytics.ts so the two
 * surfaces are comparable side-by-side. Names/categories shared with the
 * admin app (message-list-view, message-detail, system-error, user-login)
 * are intentional.
 *
 * Every entry carries its category, so `useTrack().event(entry)` sends a
 * complete category / action / name triple.
 */

type Entries = Record<
  string,
  { readonly name: string; readonly action: string }
>

/** Stamps `category` onto each entry of one catalogue category. */
function withCategory<const C extends string, const E extends Entries>(
  category: C,
  entries: E,
): { [K in keyof E]: E[K] & { readonly category: C } } {
  return Object.fromEntries(
    Object.entries(entries).map(([key, entry]) => [
      key,
      { ...entry, category },
    ]),
  ) as { [K in keyof E]: E[K] & { readonly category: C } }
}

export const ANALYTICS = {
  message: withCategory("Message", {
    listView: { name: "message-list-view", action: "Message List Viewed" },
    detail: { name: "message-detail", action: "Message Opened" },
    back: { name: "message-back-click", action: "Return to List" },
    attachmentDownload: {
      name: "message-attachment-download",
      action: "Attachment Downloaded",
    },
    attachmentError: {
      name: "message-attachment-download-error",
      action: "Attachment Unavailable",
    },
    attachmentOpen: {
      name: "message-attachment-open",
      action: "Attachment Opened",
    },
    /** A read-status filter (unread or read) newly applied; clearing is not tracked. */
    filter: { name: "message-filter", action: "Filter Applied" },
    /** On success only. Value: number of messages deleted (bulk from the list, or 1 from detail). */
    delete: { name: "message-delete", action: "Messages Deleted" },
    /** On success only. Value: number of deleted messages returned to the inbox. */
    restore: { name: "message-restore", action: "Messages Restored" },
    /** On success only. Value: number of deleted messages erased for good. */
    erase: { name: "message-erase", action: "Messages Erased" },
    /** On success only. Value: number of messages moved, into a folder or back to the inbox. */
    move: { name: "message-move", action: "Messages Moved" },
    /** The citizen navigated to the Inbox (not on page load). */
    inboxOpen: { name: "inbox-open", action: "Inbox Opened" },
    /** The citizen navigated to Deleted, which is not a Folder. */
    deletedOpen: {
      name: "deleted-messages-open",
      action: "Deleted Messages Opened",
    },
  }),
  /** Successful actions only. Folder names and ids are never sent: citizens type the names. */
  folder: withCategory("Folder", {
    create: { name: "folder-create", action: "Folder Created" },
    rename: { name: "folder-rename", action: "Folder Renamed" },
    delete: { name: "folder-delete", action: "Folder Deleted" },
    /** The citizen navigated to one of their Folders; never says which. */
    open: { name: "folder-open", action: "Folder Opened" },
  }),
  user: withCategory("User", {
    login: { name: "user-login", action: "Login" },
  }),
  consent: withCategory("Consent", {
    accepted: { name: "consent-accepted", action: "Consent Accepted" },
    declined: { name: "consent-declined", action: "Consent Declined" },
  }),
  profile: withCategory("Profile", {
    consentChange: {
      name: "profile-consent-change",
      action: "Consent Change Initiated",
    },
    exportRequested: {
      name: "export-requested",
      action: "Data Export Requested",
    },
    exportRequestError: {
      name: "export-request-error",
      action: "Data Export Request Failed",
    },
    exportDownloaded: {
      name: "export-downloaded",
      action: "Data Export Downloaded",
    },
    exportDownloadError: {
      name: "export-download-error",
      action: "Data Export Download Failed",
    },
    publicNameUpdate: {
      name: "profile-public-name-update",
      action: "Public Name Updated",
    },
    /** The update call failed; empty-name validation is not tracked. */
    publicNameUpdateError: {
      name: "profile-public-name-update-error",
      action: "Public Name Update Failed",
    },
    /** Reveal only; hiding the PPSN again is not tracked. */
    ppsnReveal: { name: "profile-ppsn-reveal", action: "PPSN Revealed" },
  }),
  accountLinking: withCategory("Account Linking", {
    /** The citizen confirmed linking the secure message's profile to their account. */
    confirm: {
      name: "account-linking-confirm",
      action: "Account Linking Confirmed",
    },
    /** Both the already-owned and the generic failure. */
    confirmError: {
      name: "account-linking-confirm-error",
      action: "Account Linking Failed",
    },
    /** The citizen reported a message they did not expect; never carries the email. */
    report: { name: "account-linking-report", action: "Problem Reported" },
  }),
  /**
   * A committed search, once its results load. Value: result count. The
   * search text is never sent: citizens can type names or a PPSN.
   */
  search: withCategory("Search", {
    messages: { name: "messages-searched", action: "Messages Searched" },
    submissions: {
      name: "submissions-searched",
      action: "Submissions Searched",
    },
  }),
  /**
   * The life-events funnel: dashboard, then discovery. Life-event slugs and
   * titles are never sent.
   */
  lifeEvent: withCategory("Life Event", {
    /** The dashboard was shown; the funnel's first step. */
    dashboardView: { name: "dashboard-view", action: "Dashboard Viewed" },
    dashboardOpen: {
      name: "dashboard-life-event-open",
      action: "Life Event Opened from Dashboard",
    },
    dashboardViewAll: {
      name: "dashboard-life-events-all",
      action: "All Life Events Opened",
    },
    overviewView: {
      name: "discovery-view",
      action: "Life Events Overview Viewed",
    },
    view: { name: "life-event-view", action: "Life Event Viewed" },
    /**
     * The citizen followed a service out of the portal: an external service
     * link on a life event, or an external button on a service page.
     */
    journeyStart: { name: "journey-start", action: "Journey Started" },
  }),
  /** Application ids and titles are never sent. */
  application: withCategory("Application", {
    dashboardOpen: {
      name: "dashboard-application-open",
      action: "Application Opened from Dashboard",
    },
    dashboardViewAll: {
      name: "dashboard-applications-all",
      action: "All Applications Opened",
    },
    listView: {
      name: "application-list-view",
      action: "Applications List Viewed",
    },
    /** An application has loaded; a failed load is not tracked. */
    detail: { name: "application-detail", action: "Application Viewed" },
    /** Sent with `message-detail` when the message was opened from an application. */
    messageOpen: {
      name: "application-message-open",
      action: "Message Opened from Application",
    },
  }),
  system: withCategory("System", {
    error: { name: "system-error", action: "Application Error" },
  }),
} as const

type Catalogue = typeof ANALYTICS

/** The search events, one per searchable list. */
export type SearchEvent = Catalogue["search"][keyof Catalogue["search"]]

/** Any single entry of the catalogue; arbitrary strings do not type-check. */
export type AnalyticsEvent = {
  [C in keyof Catalogue]: Catalogue[C][keyof Catalogue[C]]
}[keyof Catalogue]
