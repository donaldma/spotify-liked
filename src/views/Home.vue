<template>
    <div class="hero">
        <div class="hero-content text-center">
            <div class="max-w-md">
                <h1 class="mb-5 text-5xl font-bold">Liked This Week.</h1>
                <p class="mb-5">
                    Generate a playlist filled with songs that you liked this
                    week.
                </p>
                <button
                    v-show="!getAuth()"
                    class="btn btn-primary flex mb-5 mx-auto"
                    @click="auth"
                >
                    Connect with Spotify
                </button>

                <select
                    v-show="getAuth()"
                    class="select select-bordered mb-2 w-full"
                >
                    <option disabled="disabled" selected="selected">
                        Choose your playlist type
                    </option>
                    <option
                        v-for="(option, index) in options"
                        :key="index"
                        @click="selected = index"
                    >
                        {{ option }}
                    </option>
                </select>
                <button class="btn btn-primary flex w-full" @click="main">
                    Generate
                </button>
            </div>
        </div>
    </div>

    <div v-show="loading">Loading..</div>

    <div>
        <iframe
            v-show="!loading"
            :src="playlist"
            width="100%"
            height="380"
            frameBorder="0"
            allowtransparency="true"
            allow="encrypted-media"
        />
    </div>
</template>

<script>
import { ref } from 'vue'
import SpotifyWebApi from 'spotify-web-api-node'
import { parse, stringifyUrl } from 'query-string'
import { decodeXML } from 'entities'
import concat from 'lodash/concat'
import range from 'lodash/range'

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
            'Since last release period',
            'Today',
            'This Week',
            'This Month',
            'This Year',
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
            redirectUri: process.env.VUE_APP_REDIRECT_URI,
            accessToken: this.getAuth(),
        })

        await this.main()
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
                const { body: me } = await this.api.getMe()
                const { tracks, start, end } = await this.getMySavedTracks()
                const playlist = await this.createOrEditPlaylist(start, end)
                await this.api.addTracksToPlaylist(playlist.id, tracks)
                this.playlist = `https://open.spotify.com/embed/playlist/${playlist.id}?theme=0`
                console.log({ me, tracks, playlist })
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

            if (this.selected === 0) {
                const today = instance.day()
                const thisFri = instance.day(5)
                const lastFri = instance.subtract(1, 'week').day(5)
                const nextFri = instance.add(1, 'week').day(5)
                const start = today < 5 ? lastFri : thisFri
                const end = today < 5 ? thisFri : nextFri
                return { start, end }
            }

            if (this.selected === 1) {
                const today = instance.day()
                const thisFri = instance.day(5)
                const lastFri = instance.subtract(1, 'week').day(5)
                const nextFri = instance.add(1, 'week').day(5)
                const start = today < 5 ? lastFri : thisFri
                const end = today < 5 ? thisFri : nextFri
                return { start, end }
            }
        },
        async getMySavedTracks() {
            console.log('getMySavedTracks')

            let tracks = []

            const instance = dayjs()
            const today = instance.day()
            const thisFri = instance.day(5)
            const lastFri = instance.subtract(1, 'week').day(5)
            const nextFri = instance.add(1, 'week').day(5)
            const start = today < 5 ? lastFri : thisFri
            const end = today < 5 ? thisFri : nextFri
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
                            'day',
                            '[)'
                        )
                    })
                    .map((item) => item.track.uri)
                console.log({ start, end, bucket })

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
        async createOrEditPlaylist(start, end) {
            console.log('createOrEditPlaylist')

            const title = 'Liked This Week'
            const descriptionPre = 'New songs liked by you this week'
            const descriptionPost =
                'Generated by https://github.com/donaldma/spotify-liked-this-week.'
            const description = `${descriptionPre} [${start} - ${end}]. ${descriptionPost}`

            const { body: playlists } = await this.api.getUserPlaylists({
                limit: this.limit,
            })

            const foundPlaylist = playlists.items.find((item) => {
                const itemDescription = decodeXML(item.description)
                return (
                    item.name === title &&
                    itemDescription.startsWith(descriptionPre) &&
                    itemDescription.endsWith(descriptionPost)
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
