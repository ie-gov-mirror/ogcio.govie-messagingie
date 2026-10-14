import { Fragment } from "react"

/**
 * Extends the DS Material Symbols preload with icons used in
 * citizen-portal that are not yet in `@ogcio/design-system-react`'s
 * `LoadMaterialSymbols` subset (e.g. `drive_file_move` on the message
 * detail toolbar, and the Life Events glyphs `school`, `blind`, and
 * `local_florist`, which are not in the Icon registry).
 */
export function LoadMaterialSymbols() {
  // NOTE: Google Fonts requires `icon_names` to be sorted alphabetically
  // (ASCII order) — an unsorted list yields a 400 and no font loads at all.
  const iconNames = [
    "accessibility_new",
    "add_circle",
    "apps",
    "arrow_back",
    "arrow_downward",
    "arrow_drop_down",
    "arrow_drop_up",
    "arrow_forward",
    "arrow_left_alt",
    "arrow_outward",
    "arrow_right_alt",
    "arrow_upward",
    "attach_file",
    "blind",
    "block",
    "call",
    "cancel",
    "candlestick_chart",
    "chat_bubble",
    "check",
    "check_circle",
    "chevron_left",
    "chevron_right",
    "child_care",
    "close",
    "content_copy",
    "credit_card",
    "delete",
    "description",
    "directions_car",
    "do_not_disturb_on",
    "download",
    "draft",
    "drive_file_move",
    "edit",
    "error",
    "event",
    "filter_list",
    "first_page",
    "health_and_safety",
    "home",
    "image",
    "info",
    "keyboard_arrow_down",
    "keyboard_arrow_up",
    "last_page",
    "link",
    "local_florist",
    "location_on",
    "login",
    "logout",
    "mail",
    "menu",
    "mic",
    "more_horiz",
    "more_vert",
    "open_in_new",
    "person",
    "person_cancel",
    "person_check",
    "picture_as_pdf",
    "refresh",
    "school",
    "search",
    "send",
    "settings",
    "sort",
    "space_dashboard",
    "swap_vert",
    "sync",
    "table_chart",
    "thumb_down",
    "thumb_up",
    "unfold_more",
    "upload",
    "visibility",
    "visibility_off",
    "warning",
    "work",
  ].join(",")

  return (
    <Fragment>
      <link rel='preconnect' href='https://fonts.googleapis.com' />
      <link
        rel='preconnect'
        href='https://fonts.gstatic.com'
        crossOrigin='anonymous'
      />
      <link
        href={`https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,400,0..1,0&icon_names=${iconNames}`}
        rel='stylesheet'
      />
    </Fragment>
  )
}
