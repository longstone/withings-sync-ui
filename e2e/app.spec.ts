import { test, expect, type Route } from '@playwright/test'
import { backendPort } from './test-environment'

type MockProfile = {
  id: string
  name: string
  ownerUserId: string
  enabled: boolean
  scheduleCron: string | null
  garminAccountId: string | null
  trainerroadAccountId: string | null
  garminUsername: string
  garminPassword: string
  trainerroadUsername: string
  trainerroadPassword: string
  runs: any[]
}

const defaultSettings = {
  logLevel: 'info',
  apiTimeout: 30,
  timeFormat: '24h',
  dateFormat: 'DD/MM/YYYY',
  withingsCustomApp: false
}

let profiles: MockProfile[] = []

const fulfillJson = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body)
  })

test.beforeEach(async ({ page }) => {
  profiles = []

  const apiUrl = `http://localhost:${backendPort}/api`
  const wsUrl = `ws://localhost:${backendPort}`
  await page.addInitScript(
    ({ apiUrl, wsUrl }) => {
      window.__env = { apiUrl, wsUrl }
    },
    { apiUrl, wsUrl }
  )

  await page.route('**/api/settings', async route => {
    await fulfillJson(route, defaultSettings)
  })

  await page.route('**/api/profiles**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const method = request.method()
    const isProfilesRoot = path.endsWith('/api/profiles')
    const idMatch = path.match(/\/api\/profiles\/([^/]+)/)
    const profileId = idMatch?.[1]

    if (method === 'GET' && isProfilesRoot) {
      return fulfillJson(route, { profiles })
    }

    if (method === 'POST' && isProfilesRoot) {
      const data = request.postDataJSON() as Partial<MockProfile> | null
      const newProfile: MockProfile = {
        id: `profile-${Date.now()}`,
        name: data?.name ?? 'New Profile',
        ownerUserId: data?.ownerUserId ?? 'default-user',
        enabled: data?.enabled ?? true,
        scheduleCron: data?.scheduleCron ?? '',
        garminAccountId: null,
        garminUsername: data?.garminUsername ?? '',
        garminPassword: data?.garminPassword ?? '',
        trainerroadAccountId: null,
        trainerroadUsername: data?.trainerroadUsername ?? '',
        trainerroadPassword: data?.trainerroadPassword ?? '',
        runs: []
      }

      profiles.push(newProfile)
      return fulfillJson(route, { profile: newProfile }, 201)
    }

    if (profileId) {
      const profile = profiles.find(p => p.id === profileId)

      if (method === 'GET') {
        if (!profile) {
          return fulfillJson(route, { error: 'Not found' }, 404)
        }

        return fulfillJson(route, { profile })
      }

      if (method === 'DELETE') {
        profiles = profiles.filter(p => p.id !== profileId)
        return fulfillJson(route, { success: true })
      }
    }

    return route.continue()
  })
})

test('shows empty profiles state on first load', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Sync Profiles' })).toBeVisible()
  await expect(
    page.getByText('No profiles found. Create your first profile to get started.')
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create First Profile' })).toBeVisible()
})

test('can create, view, and delete a profile', async ({ page }) => {
  const profileName = `E2E Profile ${Date.now()}`

  await page.goto('/')
  await page.getByRole('button', { name: 'Create First Profile' }).click()
  await expect(page).toHaveURL(/\/profiles\/new$/)

  await page.getByLabel('Profile Name *').fill(profileName)
  await page.getByRole('button', { name: 'Create Profile' }).click()
  await expect(page).toHaveURL(/\/profiles$/)

  const profileCard = page.locator('.profile-card', { hasText: profileName })
  await expect(profileCard).toBeVisible()
  await expect(profileCard.getByText('Active')).toBeVisible()

  await profileCard.getByRole('button', { name: 'Edit Profile' }).click()
  await expect(page).toHaveURL(/\/profiles\/profile-\d+$/)
  await expect(page.getByRole('heading', { name: 'Edit Profile' })).toBeVisible()
  await expect(page.getByLabel('Profile Name *')).toHaveValue(profileName)

  await page.getByRole('button', { name: 'Cancel' }).first().click()
  await expect(page).toHaveURL(/\/profiles$/)

  const profileCardAfter = page.locator('.profile-card', { hasText: profileName })
  page.once('dialog', dialog => dialog.accept())
  await profileCardAfter.getByRole('button', { name: 'Delete' }).click()

  await expect(profileCardAfter).toHaveCount(0)
  await expect(
    page.getByText('No profiles found. Create your first profile to get started.')
  ).toBeVisible()
})
