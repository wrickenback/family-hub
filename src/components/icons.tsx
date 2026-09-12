// Thin re-exports over lucide-react so the rest of the app can keep using
// its own semantic names (IconGames, IconSolo, ...) without every screen
// needing to know which underlying icon set backs them.
export {
  Gamepad2 as IconGames,
  Trophy as IconTrophy,
  CalendarDays as IconCalendar,
  Hourglass as IconHourglass,
  Clock as IconClock,
  ChevronLeft as IconChevronLeft,
  ChevronRight as IconChevronRight,
  User as IconSolo,
  Users as IconMulti,
} from 'lucide-react';
