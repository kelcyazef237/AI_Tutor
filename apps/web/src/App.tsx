import { Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { AnalyticsPage } from '@/pages/Analytics';
import { Dashboard } from '@/pages/Dashboard';
import { DiagramsPage } from '@/pages/Diagrams';
import { GoalsPage } from '@/pages/Goals';
import { HistoryPage } from '@/pages/History';
import { NotFound } from '@/pages/NotFound';
import { QuestionsPage } from '@/pages/Questions';
import { RecallLobby, RecallRun } from '@/pages/Recall';
import { ReviewPage } from '@/pages/Review';
import { SessionPage } from '@/pages/Session';
import { SettingsPage } from '@/pages/Settings';
import { SimulationLobby, SimulationRun } from '@/pages/Simulation';
import { SkillMapPage } from '@/pages/SkillMap';
import { TrainPage } from '@/pages/Train';

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Dashboard />} />
        <Route path="train" element={<TrainPage />} />
        <Route path="diagrams" element={<DiagramsPage />} />
        <Route path="simulation" element={<SimulationLobby />} />
        <Route path="simulation/:id" element={<SimulationRun />} />
        <Route path="skills" element={<SkillMapPage />} />
        <Route path="review" element={<ReviewPage />} />
        <Route path="recall" element={<RecallLobby />} />
        <Route path="recall/:id" element={<RecallRun />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="questions" element={<QuestionsPage />} />
        <Route path="goals" element={<GoalsPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="session/:id" element={<SessionPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
