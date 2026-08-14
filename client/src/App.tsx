import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Universo from "./pages/Universo";
import MinhaIA from "./pages/MinhaIA";
import Plugins from "./pages/Plugins";
import Memoria from "./pages/Memoria";
import Agentes from "./pages/Agentes";
import Modelos from "./pages/Modelos";
import Projetos from "./pages/Projetos";
import Config from "./pages/Config";
import Status from "./pages/Status";
import Docs from "./pages/Docs";
import Analytics from "./pages/Analytics";
import Chat from "./pages/Chat";
import Marketplace from "./pages/Marketplace";
import Admin from "./pages/Admin";
import Profile from "./pages/Profile";
import { Notifications } from "./pages/Notifications";
import { Achievements } from "./pages/Achievements";
import NexusLayout from "./components/NexusLayout";

function Router() {
  return (
    <NexusLayout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/universo" component={Universo} />
        <Route path="/minha-ia" component={MinhaIA} />
        <Route path="/plugins" component={Plugins} />
        <Route path="/memoria" component={Memoria} />
        <Route path="/agentes" component={Agentes} />
        <Route path="/modelos" component={Modelos} />
        <Route path="/projetos" component={Projetos} />
        <Route path="/config" component={Config} />
        <Route path="/status" component={Status} />
        <Route path="/docs" component={Docs} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/chat" component={Chat} />
        <Route path="/marketplace" component={Marketplace} />
        <Route path="/admin" component={Admin} />
        <Route path="/profile" component={Profile} />
        <Route path="/notificacoes" component={Notifications} />
        <Route path="/conquistas" component={Achievements} />
        <Route component={NotFound} />
      </Switch>
    </NexusLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark" switchable>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
