import { Route, Routes } from "react-router-dom";
import AppLayout from "./components/AppLayout";
import DashboardPage from "./pages/DashboardPage";
import IncidentsPage from "./pages/IncidentsPage";
import RulesPage from "./pages/RulesPage";
import ChattersPage from "./pages/ChattersPage";
import ConfigurationPage from "./pages/ConfigurationPage";

function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/incidents" element={<IncidentsPage />} />
        <Route path="/rules" element={<RulesPage />} />
        <Route path="/chatters" element={<ChattersPage />} />
        <Route path="/configuration" element={<ConfigurationPage />} />
      </Route>
    </Routes>
  );
}

export default App;