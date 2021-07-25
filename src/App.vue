<template>
    <div
        class="navbar rounded-box mb-2 text-neutral-content bg-neutral shadow-lg"
    >
        <div class="flex-1 mx-2 px-2">
            <a class="text-lg font-bold">
                LTW
            </a>
        </div>
        <div class="flex-none">
            <div class="flex items-center">
                <div class="dropdown dropdown-end">
                    <div tabindex="0" class="btn btn-ghost btn-circle">
                        <div class="avatar">
                            <div class="w-10 h-10 rounded-full">
                                <img src="https://i.pravatar.cc/500?img=32" />
                            </div>
                        </div>
                    </div>
                    <ul
                        class="menu dropdown-content rounded-box w-52 text-base-content bg-base-200 shadow"
                    >
                        <li>
                            <router-link to="" @click="clearAuth">
                                Logout
                            </router-link>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    </div>
    <router-view />
</template>

<script>
import authMixin from '@/mixins/auth'

export default {
    mixins: [authMixin],
}
</script>
