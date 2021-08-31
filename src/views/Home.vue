<template>
    <div class="hero">
        <div class="hero-content text-center">
            <div class="max-w-md">
                <h1 class="mb-5 text-5xl font-bold">Liked</h1>
                <p class="mb-5">
                    Generate various playlists from your liked songs.
                </p>

                <button
                    v-show="!getAuth()"
                    class="btn btn-primary flex mx-auto"
                    @click="auth"
                >
                    Connect with Spotify
                </button>

                <div v-show="getAuth()">
                    <div class="form-control mb-5">
                        <label
                            v-for="(option, index) in options"
                            :key="index"
                            class="label cursor-pointer"
                        >
                            <span class="label-text">{{ option.label }}</span>
                            <input
                                type="checkbox"
                                v-model="checked"
                                :value="index"
                                :disabled="option.disabled"
                                class="checkbox checkbox-primary"
                            />
                        </label>
                    </div>
                    <button
                        class="btn btn-primary flex w-full"
                        @click="mainWrapper"
                    >
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
import { stringifyUrl } from 'query-string'
import { decodeXML } from 'entities'
import { isMatch } from 'matcher'
import pluralize from 'pluralize'

import concat from 'lodash/concat'
import range from 'lodash/range'
import chunk from 'lodash/chunk'

import dayjs from '@/utils/dayjs'
import { setAuth, getAuth, clearAuth } from '@/utils/auth'
import { getStartEnd, createDescription } from '@/utils/spotify'

setAuth()

/**
 * data
 */
const loading = ref(false)
const checked = ref(range(5))
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
        clientId: process.env.VUE_APP_CLIENT_ID,
        redirectUri: process.env.URL || process.env.VUE_APP_REDIRECT_URI,
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
const defaultQueryParams = {
    limit: 50,
    offset: 0,
}
const limit = ref(defaultQueryParams.limit)
const offset = ref(defaultQueryParams.offset)
const resetQueryParams = () => {
    limit.value = defaultQueryParams.limit
    offset.value = defaultQueryParams.offset
}

/**
 * methods
 */
const auth = () => {
    const url = stringifyUrl({
        url: 'https://accounts.spotify.com/en/authorize',
        query: {
            client_id: rawApi._credentials.clientId,
            redirect_uri: rawApi._credentials.redirectUri,
            response_type: 'token',
            scope: [
                'user-library-read',
                'playlist-modify-public',
                'playlist-read-collaborative',
            ],
            show_dialog: true,
            state: 'spotify-liked-this-week',
        },
    })
    location.href = url
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
        // get me
        const { body: me } = await rawApi.getMe()

        playlists.value = []

        for (const option of checked.value) {
            // get all liked tracks
            const { tracks, start, end } = await getMySavedTracks(option)
            // create or edit playlist info
            const playlist = await createOrEditPlaylist(start, end, option)
            // add tracks to playlist
            if (tracks.length > 0) {
                for (const chunkAdd of chunk(tracks, 100)) {
                    await rawApi.addTracksToPlaylist(playlist.id, chunkAdd)
                }
            }

            playlists.value.push(playlist.external_urls.spotify)
            // console.log({ tracks, playlist, start, end })
        }
    } catch (error) {
        if (error.statusCode === 401) {
            clearAuth(null)
        }
        console.error(error)
    } finally {
        loading.value = false
    }
}

const getMySavedTracks = async (option) => {
    let tracks = []
    resetQueryParams()

    const { start, end, unit, inclusivity } = getStartEnd(option)
    const format = 'ddd, ll'

    const get = async () => {
        const { body: savedTracks } = await rawApi.getMySavedTracks({
            limit: limit.value,
            offset: offset.value,
        })

        const bucket = savedTracks.items
            .filter((item) => {
                return dayjs(item.added_at).isBetween(
                    start,
                    end,
                    unit,
                    inclusivity || '[]'
                )
            })
            .map((item) => item.track.uri)

        tracks = concat(tracks, bucket)

        if (bucket.length === limit.value) {
            offset.value = offset.value + limit.value
            await get()
        }
    }

    await get()

    // console.log('getMySavedTracks', {
    //     option,
    //     length: tracks.length,
    //     start,
    //     end,
    //     unit,
    //     inclusivity,
    // })

    return {
        tracks,
        start: start.format(format),
        end: end.format(format),
    }
}

const createOrEditPlaylist = async (start, end, option) => {
    // console.log('createOrEditPlaylist')

    const label = options.value[option].label
    const title = `Liked ${label}`
    const description = createDescription(start, end)

    const { body: playlists } = await rawApi.getUserPlaylists({
        limit: limit.value,
    })

    const foundPlaylist = playlists.items.find((item) => {
        const itemDescription = decodeXML(item.description)
        return (
            item.name === title &&
            isMatch(itemDescription, createDescription('*', '*'))
        )
    })

    if (foundPlaylist) {
        // console.log('editPlaylist')

        const { id, snapshot_id, tracks } = foundPlaylist
        const positions = range(0, tracks.total)

        if (positions.length > 0) {
            await rawApi.removeTracksFromPlaylistByPosition(
                id,
                positions,
                snapshot_id
            )
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
