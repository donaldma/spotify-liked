<template>
    <nav-header />
    <router-view />
</template>

<script>
import authMixin from '@/mixins/auth'
import NavHeader from '@/components/nav-header'

export default {
    mixins: [authMixin],
    components: {
        NavHeader,
    },
}
</script>
