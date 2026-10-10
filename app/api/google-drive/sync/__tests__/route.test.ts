import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/google-drive/sync-current-user", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/google-drive/sync-current-user")>()
  return {
    ...actual,
    syncCurrentUserToGoogleDrive: vi.fn(),
  }
})

import {
  GoogleDriveSyncError,
  syncCurrentUserToGoogleDrive,
} from "@/lib/google-drive/sync-current-user"
import { POST } from "../route"

describe("POST /api/google-drive/sync", () => {
  beforeEach(() => {
    vi.mocked(syncCurrentUserToGoogleDrive).mockReset()
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  it("returns 401 with a generic auth message", async () => {
    vi.mocked(syncCurrentUserToGoogleDrive).mockRejectedValueOnce(
      new GoogleDriveSyncError("auth", "Authentication required for Google Drive sync."),
    )

    const response = await POST()
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json).toEqual({ success: false, message: "Authentication required." })
  })

  it("returns 400 with a generic validation message", async () => {
    vi.mocked(syncCurrentUserToGoogleDrive).mockRejectedValueOnce(
      new GoogleDriveSyncError("validation", "folder id missing"),
    )

    const response = await POST()
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json).toEqual({ success: false, message: "Invalid sync request." })
    expect(JSON.stringify(json)).not.toContain("folder id")
  })

  it("hides raw provider/database errors", async () => {
    vi.mocked(syncCurrentUserToGoogleDrive).mockRejectedValueOnce(
      new Error("column X does not exist"),
    )

    const response = await POST()
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json).toEqual({
      success: false,
      message: "Google Drive sync could not be completed.",
    })
    expect(JSON.stringify(json)).not.toContain("column X")
  })

  it("returns the existing success payload", async () => {
    vi.mocked(syncCurrentUserToGoogleDrive).mockResolvedValueOnce({
      action: "updated",
      fileId: "file-1",
      fileName: "client-1.json",
      webViewLink: null,
      modifiedTime: "2026-10-07T00:00:00.000Z",
    })

    const response = await POST()
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({
      success: true,
      sync: {
        action: "updated",
        fileId: "file-1",
        modifiedTime: "2026-10-07T00:00:00.000Z",
      },
    })
  })
})
