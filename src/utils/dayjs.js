/**
 * create dayjs instance with all required plugins
 */
import dayjs from 'dayjs'

// plugins
import isBetween from 'dayjs/plugin/isBetween'
import localizedFormat from 'dayjs/plugin/localizedFormat'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

// extend plugins
dayjs.extend(isBetween)
dayjs.extend(localizedFormat)
dayjs.extend(utc)
dayjs.extend(timezone)

// export instance
export default dayjs
