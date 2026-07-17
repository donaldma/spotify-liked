<template>
    <div class="hero">
        <div class="hero-content text-center">
            <div class="max-w-md">
                <h1 class="mb-5 text-5xl font-bold">Liked</h1>
                <p class="mb-5">
                    Generate various playlists from your liked songs.
                </p>

                <button v-show="!getAuth()" class="btn btn-primary flex mx-auto" @click="auth">
                    Connect with Spotify
                </button>

                <div v-show="getAuth()">
                    <div class="form-control mb-5">
                        <label v-for="(option, index) in options" :key="index" class="label cursor-pointer">
                            <span class="label-text">{{ option.label }}</span>
                            <input type="checkbox" v-model="checked" :value="index" :disabled="option.disabled"
                                class="checkbox checkbox-primary" />
                        </label>
                    </div>
                    <button class="btn btn-primary flex w-full" @click="mainWrapper">
                        Generate
                    </button>
                </div>
            </div>
        </div>
    </div>

    <!-- spotify loader -->
    <div class="flex items-center justify-center w-full">
        <span v-show="loading">Loading..</span>
        <span v-show="!loading && playlists.length > 0">
            {{ doneMessage }}
        </span>
    </div>
</template>

<script setup>
/* eslint-disable */
import { ref, unref, computed } from 'vue'
import SpotifyWebApi from 'spotify-web-api-node'
import { decodeXML } from 'entities'
import { isMatch } from 'matcher'
import pluralize from 'pluralize'

import chunk from 'lodash/chunk'

import dayjs from '@/utils/dayjs'
import { setAuth, getAuth, clearAuth, beginAuth } from '@/utils/auth'
import { getStartEnd, createDescription } from '@/utils/spotify'

const credentials = {
    clientId: process.env.VUE_APP_CLIENT_ID,
    redirectUri: process.env.URL || process.env.VUE_APP_REDIRECT_URI,
}

setAuth(credentials)

/**
 * data
 */
const loading = ref(false)
const checked = ref([3, 4])
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
])

// api stuff
const api = ref(
    new SpotifyWebApi({
        ...credentials,
        accessToken: getAuth(),
    })
)
const rawApi = unref(api)

// playlists stuff
const playlists = ref([])
const time = ref()
const doneMessage = computed(() => {
    const playlistsCount = playlists.value.length
    const playlistsPluralize = pluralize('playlist', playlistsCount)
    const seconds = (time.value / 1000).toFixed(1) + 's'

    return `Generated ${playlistsCount} ${playlistsPluralize} in ${seconds}`
})

// query param stuff
const pageSize = 50
const concurrency = 5

/**
 * methods
 */
const auth = () => {
    beginAuth({
        ...credentials,
        scope: [
            'user-library-read',
            'playlist-modify-public',
            'playlist-read-collaborative',
        ],
        state: 'spotify-liked-this-week',
    })
}

const mainWrapper = async () => {
    const before = performance.now()
    await main()
    const after = performance.now()

    time.value = after - before
}

const main = async () => {
    // console.log('main')

    loading.value = true

    try {
        playlists.value = []

        // fetch liked tracks once, back to the earliest date any option needs
        const earliestStart = checked.value
            .map((option) => getStartEnd(option).start)
            .reduce((min, start) => (start.isBefore(min) ? start : min))
        const savedTracks = await getMySavedTracks(earliestStart)

        // fetch existing playlists once
        const { body: userPlaylists } = await rawApi.getUserPlaylists({
            limit: pageSize,
        })

        await Promise.all(
            checked.value.map(async (option) => {
                // filter liked tracks locally
                const { tracks, start, end } = filterTracks(savedTracks, option)
                // create or edit playlist info
                const playlist = await createOrEditPlaylist(
                    userPlaylists.items,
                    start,
                    end,
                    option
                )
                // add tracks to playlist
                for (const chunkAdd of chunk(tracks, 100)) {
                    await rawApi.addTracksToPlaylist(playlist.id, chunkAdd)
                }

                playlists.value.push(playlist.external_urls.spotify)
                // console.log({ tracks, playlist, start, end })
            })
        )
    } catch (error) {
        if (error.statusCode === 401) {
            clearAuth(null)
        }
        console.error(error)
    } finally {
        loading.value = false
    }
}

// pages through liked tracks (newest first) in parallel batches,
// stopping once results are older than earliestStart
const getMySavedTracks = async (earliestStart) => {
    const { body: first } = await rawApi.getMySavedTracks({
        limit: pageSize,
        offset: 0,
    })

    const items = [...first.items]
    let offset = pageSize

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
                return rawApi.getMySavedTracks({
                    limit: pageSize,
                    offset: pageOffset,
                })
            })
        )

        for (const { body } of pages) {
            items.push(...body.items)
        }
    }

    console.log('getMySavedTracks', {
        fetched: items.length,
        total: first.total,
    })

    return items
}

const filterTracks = (savedTracks, option) => {
    const { start, end, unit, inclusivity } = getStartEnd(option)
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
        .map((item) => item.track.uri)

    console.log('filterTracks', {
        option,
        length: tracks.length,
        start,
        end,
        unit,
        inclusivity,
    })

    return {
        tracks,
        start: start.format(format),
        end: end.format(format),
    }
}

const createOrEditPlaylist = async (userPlaylists, start, end, option) => {
    // console.log('createOrEditPlaylist')

    const label = options.value[option].label
    const title = `Liked ${label}`
    const description = createDescription(start, end)

    const foundPlaylist = userPlaylists.find((item) => {
        const itemDescription = decodeXML(item.description)
        return (
            item.name === title &&
            isMatch(itemDescription, createDescription('*', '*'))
        )
    })

    if (foundPlaylist) {
        // console.log('editPlaylist')

        const { id, tracks } = foundPlaylist

        // clears the whole playlist in a single request
        if (tracks.total > 0) {
            await rawApi.replaceTracksInPlaylist(id, [])
        }

        await rawApi.changePlaylistDetails(id, {
            description,
        })

        return foundPlaylist
    }

    // console.log('createPlaylist')
    const { body: createdPlaylist } = await rawApi.createPlaylist(title, {
        description,
    })

    return createdPlaylist
}
</script>
