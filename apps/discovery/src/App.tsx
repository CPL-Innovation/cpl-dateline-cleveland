import { useRoute } from './lib/router';
import { Discovery } from './components/Discovery';
import { StaffFrame } from './components/StaffFrame';

// Two routes: the patron discovery SPA at the base path, and the staff editorial
// workbench slugged at /staff.
export function App() {
  const route = useRoute();
  return route === 'staff' ? <StaffFrame /> : <Discovery />;
}
