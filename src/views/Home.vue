<template>
    <div class="hero">
        <div class="hero-content text-center">
            <div class="max-w-md">
                <h1 class="mb-5 text-5xl font-bold">Spotify Liked</h1>
                <p class="mb-5">
                    Generate various playlists from your liked songs.
                </p>

                <button v-show="!getAuth()" class="btn btn-primary flex mx-auto" @click="beginAuth">
                    Connect with Spotify
                </button>

                <div v-show="getAuth()">
                    <div class="form-control mb-5">
                        <label v-for="(option, index) in options" :key="index" class="label cursor-pointer">
                            <span class="label-text">{{ optionLabel(index) }}</span>
                            <input type="checkbox" v-model="checked" :value="index" :disabled="option.disabled"
                                class="checkbox checkbox-primary" />
                        </label>

                        <div v-show="checked.includes(customIndex)" class="flex space-x-2 my-2">
                            <input type="date" v-model="customStart" aria-label="Custom range start"
                                class="input input-bordered input-sm w-full" />
                            <input type="date" v-model="customEnd" aria-label="Custom range end"
                                class="input input-bordered input-sm w-full" />
                        </div>

                        <label class="label cursor-pointer">
                            <span class="label-text">Make playlists private</span>
                            <input type="checkbox" v-model="makePrivate" class="checkbox checkbox-primary" />
                        </label>
                    </div>
                    <button class="btn btn-primary flex w-full" :disabled="loading" @click="mainWrapper">
                        <span v-show="loading" class="loading loading-spinner"></span>
                        Generate
                    </button>
                    <p v-if="errorMessage" class="text-error mt-3">
                        {{ errorMessage }}
                    </p>
                </div>

                <div class="mt-8 text-sm text-left opacity-60 space-y-2">
                    <p>
                        Pick one or more time ranges and hit Generate. Each
                        range becomes a playlist of your liked songs, like
                        "Liked This Week". Re-run anytime, the same playlists
                        are refreshed in place.
                    </p>
                    <p>
                        Your login stays in your browser, there is no backend.
                        Remove the app's access anytime in your
                        <a class="link" target="_blank" rel="noopener"
                            href="https://www.spotify.com/account/apps/">
                            Spotify account settings</a>.
                    </p>
                    <p class="text-center pt-2">
                        Made with ♥ by
                        <a class="link" target="_blank" rel="noopener" href="https://www.shojinmusic.com/">Shojin</a>
                        ·
                        <a class="link" target="_blank" rel="noopener" href="https://github.com/donaldma/spotify-liked">
                            Source on GitHub
                        </a>
                    </p>
                </div>
            </div>
        </div>
    </div>

    <!-- spotify loader -->
    <div class="flex flex-col items-center justify-center w-full space-y-2 pb-8">
        <span v-show="loading">{{ progressMessage }}</span>

        <template v-if="!loading && playlists.length > 0">
            <span>{{ doneMessage }}</span>
            <template v-for="playlist in playlists" :key="playlist.name">
                <a v-if="playlist.url" :href="playlist.url" target="_blank" rel="noopener" class="link link-primary">
                    {{ playlist.name }} · {{ pluralize('track', playlist.count, true) }}
                </a>
                <span v-else class="opacity-60">
                    {{ playlist.name }} · no liked songs, skipped
                </span>
            </template>
        </template>
    </div>
</template>

<script setup>
/* eslint-disable */
import { ref, unref, computed, watch } from 'vue'
import SpotifyWebApi from 'spotify-web-api-node'
import { decodeXML } from 'entities'
import pluralize from 'pluralize'

import chunk from 'lodash/chunk'

import dayjs from '@/utils/dayjs'
import {
    setAuth,
    getAuth,
    clearAuth,
    beginAuth,
    ensureAuth,
    checkScopes,
} from '@/utils/auth'
import {
    getStartEnd,
    createDescription,
    isGeneratedDescription,
    withRetry,
} from '@/utils/spotify'

checkScopes()
setAuth()

/**
 * data
 */
const settingsKey = 'settings'
const loadSettings = () => {
    try {
        return JSON.parse(localStorage.getItem(settingsKey)) || {}
    } catch {
        return {}
    }
}
const settings = loadSettings()

const loading = ref(false)
const errorMessage = ref('')
const checked = ref(settings.checked ?? [3, 4])
const options = ref([
    {
        label: 'This Release Period',
        disabled: false,
    },
    {
        label: 'Today',
        disabled: false,
    },
    {
        label: 'This Week',
        disabled: false,
    },
    {
        label: 'This Month',
        disabled: false,
    },
    {
        label: 'This Year',
        disabled: false,
    },
    {
        label: 'Custom Range',
        disabled: false,
    },
])
const customIndex = 5
const customStart = ref(settings.customStart ?? '')
const customEnd = ref(settings.customEnd ?? '')
const makePrivate = ref(settings.makePrivate ?? false)

watch(
    [checked, customStart, customEnd, makePrivate],
    () => {
        localStorage.setItem(
            settingsKey,
            JSON.stringify({
                checked: checked.value,
                customStart: customStart.value,
                customEnd: customEnd.value,
                makePrivate: makePrivate.value,
            })
        )
    },
    { deep: true }
)

// api stuff
const api = ref(
    new SpotifyWebApi({
        accessToken: getAuth(),
    })
)
const rawApi = unref(api)

// playlists stuff
const playlists = ref([])
const time = ref()
const doneMessage = computed(() => {
    const playlistsCount = playlists.value.filter((item) => item.url).length
    const playlistsPluralize = pluralize('playlist', playlistsCount)
    const seconds = (time.value / 1000).toFixed(1) + 's'

    return `Generated ${playlistsCount} ${playlistsPluralize} in ${seconds}`
})

// progress stuff
const progress = ref({ fetched: 0, total: 0 })
const phase = ref('')
const progressMessage = computed(() => {
    if (phase.value === 'fetching' && progress.value.total > 0) {
        return `Fetching liked songs.. ${progress.value.fetched}/${progress.value.total}`
    }
    if (phase.value === 'creating') {
        return 'Creating playlists..'
    }
    return 'Loading..'
})

// query param stuff
const pageSize = 50
const concurrency = 5

/**
 * methods
 */
const getRange = (option) => {
    if (option === customIndex) {
        return {
            start: dayjs(customStart.value).startOf('day'),
            end: dayjs(customEnd.value).endOf('day'),
        }
    }
    return getStartEnd(option)
}

// option label with its date range in parentheses, e.g. "This Week (Jul 12 - Jul 18)"
const optionLabel = (option) => {
    const label = options.value[option].label
    const { start, end, inclusivity } = getRange(option)

    if (!start.isValid() || !end.isValid()) {
        return label
    }

    // an exclusive end date is not part of the range, show the day before
    const lastDay = inclusivity === '[)' ? end.subtract(1, 'day') : end

    const format = 'MMM D'
    const startLabel = start.format(format)
    const endLabel = lastDay.format(format)
    const range =
        startLabel === endLabel ? startLabel : `${startLabel} - ${endLabel}`

    // release periods are pinned to New York time
    const suffix = option === 0 ? ' ET' : ''

    return `${label} (${range}${suffix})`
}

const validate = () => {
    if (checked.value.length === 0) {
        return 'Pick at least one playlist option'
    }

    if (checked.value.includes(customIndex)) {
        if (!customStart.value || !customEnd.value) {
            return 'Pick a start and end date for the custom range'
        }
        if (
            !dayjs(customStart.value).isValid() ||
            !dayjs(customEnd.value).isValid()
        ) {
            return 'Custom range dates are invalid'
        }
        if (dayjs(customStart.value).isAfter(dayjs(customEnd.value))) {
            return 'Custom range start must be before its end'
        }
    }

    return ''
}

const mainWrapper = async () => {
    const before = performance.now()
    const ran = await main()
    const after = performance.now()

    if (ran) {
        time.value = after - before
    }
}

const main = async () => {
    // console.log('main')

    errorMessage.value = validate()
    if (errorMessage.value) {
        return false
    }

    loading.value = true

    try {
        // refresh the access token if it is (nearly) expired
        const token = await ensureAuth()
        if (!token) {
            return false
        }
        rawApi.setAccessToken(token)

        playlists.value = []

        // fetch liked tracks once, back to the earliest date any option needs
        const earliestStart = checked.value
            .map((option) => getRange(option).start)
            .reduce((min, start) => (start.isBefore(min) ? start : min))

        phase.value = 'fetching'
        const savedTracks = await getMySavedTracks(earliestStart)

        // fetch all existing playlists once
        phase.value = 'creating'
        const userPlaylists = await getUserPlaylists()

        await Promise.all(
            checked.value.map(async (option) => {
                const title = `Liked ${options.value[option].label}`
                // filter liked tracks locally
                const { tracks, start, end } = filterTracks(savedTracks, option)

                // skip options with no matching liked songs
                if (tracks.length === 0) {
                    playlists.value.push({ name: title, url: null, count: 0 })
                    return
                }

                // create or edit playlist info
                const playlist = await createOrEditPlaylist(
                    userPlaylists,
                    start,
                    end,
                    title
                )
                // add tracks to playlist
                for (const chunkAdd of chunk(tracks, 100)) {
                    await withRetry(() =>
                        rawApi.addTracksToPlaylist(playlist.id, chunkAdd)
                    )
                }

                playlists.value.push({
                    name: playlist.name,
                    url: playlist.external_urls.spotify,
                    count: tracks.length,
                })
                // console.log({ tracks, playlist, start, end })
            })
        )
    } catch (error) {
        if (error.statusCode === 401) {
            clearAuth(null)
        }
        errorMessage.value =
            error.body?.error?.message || error.message || 'Something went wrong'
        console.error(error)
    } finally {
        loading.value = false
        phase.value = ''
    }

    return true
}

// pages through liked tracks (newest first) in parallel batches,
// stopping once results are older than earliestStart
const getMySavedTracks = async (earliestStart) => {
    const { body: first } = await withRetry(() =>
        rawApi.getMySavedTracks({
            limit: pageSize,
            offset: 0,
        })
    )

    const items = [...first.items]
    let offset = pageSize
    progress.value = { fetched: items.length, total: first.total }

    while (offset < first.total) {
        const oldest = items[items.length - 1]
        if (oldest && dayjs(oldest.added_at).isBefore(earliestStart)) {
            break
        }

        const offsets = []
        while (offsets.length < concurrency && offset < first.total) {
            offsets.push(offset)
            offset = offset + pageSize
        }

        const pages = await Promise.all(
            offsets.map((pageOffset) => {
                return withRetry(() =>
                    rawApi.getMySavedTracks({
                        limit: pageSize,
                        offset: pageOffset,
                    })
                )
            })
        )

        for (const { body } of pages) {
            items.push(...body.items)
        }
        progress.value = { fetched: items.length, total: first.total }
    }

    console.log('getMySavedTracks', {
        fetched: items.length,
        total: first.total,
    })

    return items
}

const getUserPlaylists = async () => {
    const items = []
    let offset = 0

    while (true) {
        const { body } = await withRetry(() =>
            rawApi.getUserPlaylists({ limit: pageSize, offset })
        )
        items.push(...body.items)

        if (!body.next) {
            break
        }
        offset = offset + pageSize
    }

    return items
}

const filterTracks = (savedTracks, option) => {
    const { start, end, unit, inclusivity } = getRange(option)
    const format = 'ddd, ll'

    const tracks = savedTracks
        .filter((item) => {
            return dayjs(item.added_at).isBetween(
                start,
                end,
                unit,
                inclusivity || '[]'
            )
        })
        // most recently liked first
        .sort((a, b) => new Date(b.added_at) - new Date(a.added_at))
        .map((item) => item.track.uri)

    console.log('filterTracks', {
        option,
        length: tracks.length,
        start,
        end,
        unit,
        inclusivity,
    })

    // an exclusive end date is not part of the range, show the day before;
    // release periods are pinned to New York time
    const lastDay = inclusivity === '[)' ? end.subtract(1, 'day') : end
    const suffix = option === 0 ? ' ET' : ''

    return {
        tracks,
        start: start.format(format),
        end: lastDay.format(format) + suffix,
    }
}

const createOrEditPlaylist = async (userPlaylists, start, end, title) => {
    // console.log('createOrEditPlaylist')

    const description = createDescription(start, end)
    const isPublic = !makePrivate.value

    const foundPlaylist = userPlaylists.find((item) => {
        const itemDescription = decodeXML(item.description)
        return item.name === title && isGeneratedDescription(itemDescription)
    })

    if (foundPlaylist) {
        // console.log('editPlaylist')

        const { id, tracks } = foundPlaylist

        // clears the whole playlist in a single request
        if (tracks.total > 0) {
            await withRetry(() => rawApi.replaceTracksInPlaylist(id, []))
        }

        await withRetry(() =>
            rawApi.changePlaylistDetails(id, {
                description,
                public: isPublic,
            })
        )

        return foundPlaylist
    }

    // console.log('createPlaylist')
    const { body: createdPlaylist } = await withRetry(() =>
        rawApi.createPlaylist(title, {
            description,
            public: isPublic,
        })
    )

    return createdPlaylist
}
</script>
