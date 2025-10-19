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
        <Router />
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

