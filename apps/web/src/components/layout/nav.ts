import {
  BarChart3,
  BookOpenCheck,
  Brain,
  CalendarCheck,
  GraduationCap,
  History,
  LayoutDashboard,
  Library,
  Network,
  Route,
  Settings,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

export const NAV_MAIN: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, description: 'Skill overview and recommended next session' },
  { to: '/train', label: 'Train', icon: GraduationCap, description: 'Start a session in any mode' },
  { to: '/diagrams', label: 'Diagrams', icon: Workflow, description: 'AI-generated animated explanations' },
  { to: '/simulation', label: 'Simulation', icon: Route, description: 'Run a simulated pentest engagement' },
  { to: '/review', label: 'Review', icon: BookOpenCheck, description: 'Concepts due for spaced review' },
  { to: '/recall', label: 'Free Recall', icon: Brain, description: 'Write everything you remember, then see what you missed' },
];

export const NAV_INSIGHT: NavItem[] = [
  { to: '/skills', label: 'Skill Map', icon: Network, description: 'Taxonomy colored by mastery' },
  { to: '/history', label: 'History', icon: History, description: 'Past sessions and assessments' },
  { to: '/goals', label: 'Goals', icon: CalendarCheck, description: 'Daily and weekly targets, streaks' },
  { to: '/analytics', label: 'Analytics', icon: BarChart3, description: 'Trends over time' },
];

export const NAV_MANAGE: NavItem[] = [
  { to: '/questions', label: 'Questions', icon: Library, description: 'Import and write your own questions' },
  { to: '/settings', label: 'Settings', icon: Settings, description: 'Models, goals and preferences' },
];

export const ALL_NAV = [...NAV_MAIN, ...NAV_INSIGHT, ...NAV_MANAGE];
