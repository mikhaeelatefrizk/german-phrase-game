import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import TodaysWork from "./pages/TodaysWork";
import { LoginPage } from "./pages/Login";
import { RegisterPage } from "./pages/Register";
import { useAuth } from "./hooks/useAuth";
import "./styles/loading.css";

function ProtectedRoute({ component: Component, path }: { component: any; path: string }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <div className="loading-screen">Loading...</div>;
  }

  if (!isAuthenticated) {
    window.location.href = "/login";
    return null;
  }

  return <Route path={path} component={Component} />;
}

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <div className="loading-screen">Loading...</div>;
  }

  return (
    <Switch>
      {!isAuthenticated ? (
        <>
          <Route path="/login" component={LoginPage} />
          <Route path="/register" component={RegisterPage} />
          <Route path="/404" component={NotFound} />
          <Route component={LoginPage} />
        </>
      ) : (
        <>
          <Route path="/" component={Home} />
          <Route path="/todays-work" component={TodaysWork} />
          <Route path="/404" component={NotFound} />
          <Route component={NotFound} />
        </>
      )}
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

// Rebuild trigger Sun Oct 19 05:01:10 EDT 2025
