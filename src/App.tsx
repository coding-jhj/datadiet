import { Route, Routes } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { About } from "@/pages/About";
import { Coach } from "@/pages/Coach";
import { Evidence } from "@/pages/Evidence";
import { How } from "@/pages/How";
import { Landing } from "@/pages/Landing";
import { Report } from "@/pages/Report";

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Landing />} />
        <Route path="coach" element={<Coach />} />
        <Route path="report" element={<Report />} />
        <Route path="evidence" element={<Evidence />} />
        <Route path="how-it-works" element={<How />} />
        <Route path="about" element={<About />} />
        <Route path="*" element={<Landing />} />
      </Route>
    </Routes>
  );
}
