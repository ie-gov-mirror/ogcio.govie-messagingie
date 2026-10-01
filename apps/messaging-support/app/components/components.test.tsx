import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { UserTable } from "@/app/(protected)/[userId]/account-linking/components/UserTable"
import { ConsentTables } from "@/app/(protected)/[userId]/profile/ConsentTables"
import { ProfileTables } from "@/app/(protected)/[userId]/profile/ProfileTables"
import { Case, Switch } from "@/app/Switch"
import type { Consent, MainProfile, UserRelations } from "@/data/types"
import { ProfileMeta } from "./ProfileMeta"

const profile: MainProfile = {
  id: "p-1",
  primaryUserId: "p-1",
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@test.ie",
  ppsn: "1234567A",
  publicName: "Ada L",
  status: "active",
}

describe("ProfileMeta", () => {
  it("renders breadcrumbs and the full name heading", () => {
    render(
      <ProfileMeta
        searchParamsString='email=a%40b.ie'
        fullName='Ada Lovelace'
        place='Profile'
      />,
    )

    // the design system renders breadcrumb anchors without an accessible name
    expect(screen.getByText("Home").closest("a")).toHaveAttribute(
      "href",
      "/?email=a%40b.ie",
    )
    expect(
      screen.getByRole("heading", { name: "Ada Lovelace" }),
    ).toBeInTheDocument()
  })

  it("renders the error alert instead of the heading when errorText is set", () => {
    render(
      <ProfileMeta
        searchParamsString=''
        fullName='Ada Lovelace'
        place='Profile'
        errorText='something broke'
      />,
    )

    expect(screen.getByText("something broke")).toBeInTheDocument()
    expect(
      screen.queryByRole("heading", { name: "Ada Lovelace" }),
    ).not.toBeInTheDocument()
  })
})

describe("ProfileTables", () => {
  it("renders the profile summary values", () => {
    render(<ProfileTables profile={profile} />)

    expect(screen.getByText("Ada L")).toBeInTheDocument()
    expect(screen.getByText("Ada")).toBeInTheDocument()
    expect(screen.getByText("Lovelace")).toBeInTheDocument()
    expect(screen.getByText("1234567A")).toBeInTheDocument()
    expect(screen.getByText("ada@test.ie")).toBeInTheDocument()
  })
})

describe("UserTable", () => {
  it("renders the user's account data and relation", () => {
    const userRelations: UserRelations = {
      userIs: "unlinked",
      userData: {
        id: "u-1",
        email: "u1@test.ie",
        public_name: "User One",
        primary_user_id: "u-1",
      },
    }

    render(<UserTable userRelations={userRelations} />)

    expect(screen.getByText("u-1")).toBeInTheDocument()
    expect(screen.getByText("u1@test.ie")).toBeInTheDocument()
    expect(screen.getByText("unlinked")).toBeInTheDocument()
  })
})

describe("ConsentTables", () => {
  const consent = (overrides: Partial<Consent>): Consent =>
    ({
      id: "c-1",
      subject: "messaging",
      status: "opted-in",
      version: "1.0",
      cascadeReason: "",
      createdAt: "2025-03-04T10:00:00Z",
      ...overrides,
    }) as Consent

  it("groups consents by subject with mapped titles", () => {
    render(
      <ConsentTables
        consents={[
          consent({ id: "c-1", subject: "messaging" }),
          consent({ id: "c-2", subject: "marketing" }),
        ]}
      />,
    )

    expect(
      screen.getByRole("heading", { name: "MessagingIE consent history" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Marketing consent history" }),
    ).toBeInTheDocument()
  })

  it("renders a formatted date per consent row", () => {
    render(<ConsentTables consents={[consent({})]} />)

    expect(screen.getByText("2025-03-04")).toBeInTheDocument()
  })

  it("renders nothing for an empty consent list", () => {
    const { container } = render(<ConsentTables consents={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe("Switch", () => {
  it("renders only the matching case", () => {
    render(
      <Switch value='b'>
        <Case when='a'>Case A</Case>
        <Case when='b'>Case B</Case>
      </Switch>,
    )

    expect(screen.getByText("Case B")).toBeInTheDocument()
    expect(screen.queryByText("Case A")).not.toBeInTheDocument()
  })

  it("renders nothing when no case matches", () => {
    const { container } = render(
      <Switch value='x'>
        <Case when='a'>Case A</Case>
      </Switch>,
    )

    expect(container).toBeEmptyDOMElement()
  })
})
