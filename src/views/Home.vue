<template>
    <div class="hero">
        <div class="hero-content text-center">
            <div class="max-w-md">
                <h1 class="mb-5 text-5xl font-bold">Liked</h1>
                <p class="mb-5">Generate various playlists from your liked songs.</p>
                <button
                    v-show="!getAuth()"
                    class="btn btn-primary flex mb-5 mx-auto"
                    @click="auth"
                >
                    Connect with Spotify
                </button>

                <div v-show="getAuth()">
                    <select
                        class="select select-bordered mb-2 w-full"
                        v-model="selected"
                    >
                        <option
                            v-for="(option, index) in options"
                            :key="index"
                            :disabled="option.disabled"
                            :value="index"
                        >
                            {{ option.label }}
                        </option>
                    </select>
                    <button class="btn btn-primary flex w-full" @click="main">
                        Generate
                    </button>
                </div>
            </div>
        </div>
    </div>

    <!-- spotify loader -->
    <div
        v-show="loading"
        class="h-[380px] flex items-center justify-center w-full"
    >
        Loading..
    </div>

    <!-- spotify widget -->
    <iframe
        v-show="!loading && playlist"
        :src="playlist"
        width="100%"
        height="380"
        frameBorder="0"
        allowtransparency="true"
        allow="encrypted-media"
    />
</template>

<script>
/* eslint-disable */
import { ref } from 'vue'
import SpotifyWebApi from 'spotify-web-api-node'
import { parse, stringifyUrl } from 'query-string'
import { decodeXML } from 'entities'
import { isMatch } from 'matcher'

import concat from 'lodash/concat'
import range from 'lodash/range'
import chunk from 'lodash/chunk'

import dayjs from 'dayjs'
import isBetween from 'dayjs/plugin/isBetween'
dayjs.extend(isBetween)
import localizedFormat from 'dayjs/plugin/localizedFormat'
dayjs.extend(localizedFormat)

import authMixin from '@/mixins/auth'

export default {
    name: 'Home',
    components: {},
    mixins: [authMixin],
    setup() {
        console.log('setup')
        const options = [
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
        ]

        return {
            api: ref({}),
            limit: ref(50),
            offset: ref(0),
            loading: ref(false),
            playlist: ref(''),
            selected: ref(0),
            options: ref(options),
        }
    },
    async created() {
        console.log('created')

        const parsedHash = parse(location.hash)
        const accessToken = parsedHash['access_token']

        if (accessToken) {
            this.setAuth(accessToken)
            return
        }

        this.api = new SpotifyWebApi({
            clientId: process.env.VUE_APP_CLIENT_ID,
            redirectUri: process.env.URL || process.env.VUE_APP_REDIRECT_URI,
            accessToken: this.getAuth(),
        })
    },
    methods: {
        auth() {
            const url = stringifyUrl({
                url: 'https://accounts.spotify.com/en/authorize',
                query: {
                    client_id: this.api._credentials.clientId,
                    redirect_uri: this.api._credentials.redirectUri,
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
        },
        async main() {
            console.log('main')

            this.loading = true

            try {
                // get me
                const { body: me } = await this.api.getMe()
                // get all liked tracks
                const { tracks, start, end } = await this.getMySavedTracks()
                // create or edit playlist info
                const playlist = await this.createOrEditPlaylist(start, end)
                // add tracks to playlist
                if (tracks.length > 0) {
                    for (const chunkAdd of chunk(tracks, 100)) {
                        await this.api.addTracksToPlaylist(
                            playlist.id,
                            chunkAdd
                        )
                    }
                }
                // update playlist widget
                this.playlist = `https://open.spotify.com/embed/playlist/${playlist.id}?theme=0`

                // console.log({ me, tracks, playlist, start, end })
            } catch (error) {
                if (error.statusCode === 401) {
                    this.clearAuth(null)
                }
                console.error(error)
            } finally {
                this.loading = false
            }
        },
        getStartEnd() {
            const instance = dayjs()

            // This Release Period
            if (this.selected === 0) {
                const today = instance.day()
                const thisFri = instance.day(5)
                const lastFri = instance.subtract(1, 'week').day(5)
                const nextFri = instance.add(1, 'week').day(5)
                const start = today < 5 ? lastFri : thisFri
                const end = today < 5 ? thisFri : nextFri
                return { start, end, unit: 'day', inclusivity: '[)' }
            }

            // Today
            if (this.selected === 1) {
                const unit = 'day'
                const start = instance.startOf(unit)
                const end = instance.endOf(unit)
                return { start, end }
            }

            // This Week
            if (this.selected === 2) {
                const unit = 'week'
                const start = instance.startOf(unit)
                const end = instance.endOf(unit)
                return { start, end }
            }

            // This Month
            if (this.selected === 3) {
                const unit = 'month'
                const start = instance.startOf(unit)
                const end = instance.endOf(unit)
                return { start, end }
            }

            // This Year
            if (this.selected === 4) {
                const unit = 'year'
                const start = instance.startOf(unit)
                const end = instance.endOf(unit)
                return { start, end }
            }
        },
        async getMySavedTracks() {
            console.log('getMySavedTracks')

            let tracks = []

            const { start, end, unit, inclusivity } = this.getStartEnd()
            // console.log({ start, end, unit, inclusivity })
            const format = 'ddd, ll'

            const get = async () => {
                const { body: savedTracks } = await this.api.getMySavedTracks({
                    limit: this.limit,
                    offset: this.offset,
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

                if (bucket.length === this.limit) {
                    this.offset = this.offset + this.limit
                    await get()
                }
            }

            await get()

            return {
                tracks,
                start: start.format(format),
                end: end.format(format),
            }
        },
        createdDescription(start, end) {
            return `Generated by https://github.com/donaldma/spotify-liked [${start} - ${end}]`
        },
        async createOrEditPlaylist(start, end) {
            console.log('createOrEditPlaylist')

            const label = this.options[this.selected].label
            const title = `Liked ${label}`
            const description = this.createdDescription(start, end)

            const { body: playlists } = await this.api.getUserPlaylists({
                limit: this.limit,
            })

            const foundPlaylist = playlists.items.find((item) => {
                const itemDescription = decodeXML(item.description)
                return (
                    item.name === title &&
                    isMatch(itemDescription, this.createdDescription('*', '*'))
                )
            })

            if (foundPlaylist) {
                console.log('editPlaylist')

                const { id, snapshot_id, tracks } = foundPlaylist
                const positions = range(0, tracks.total)

                if (positions.length > 0) {
                    await this.api.removeTracksFromPlaylistByPosition(
                        id,
                        positions,
                        snapshot_id
                    )
                }

                await this.api.changePlaylistDetails(id, {
                    description,
                })

                return foundPlaylist
            }

            console.log('createPlaylist')
            const { body: createdPlaylist } = await this.api.createPlaylist(
                title,
                { description }
            )

            return createdPlaylist
        },
    },
}
</script>
