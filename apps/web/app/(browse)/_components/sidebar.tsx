"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { projectHref, type ProjectRef } from "../../../lib/library";
import { ProjectSquare } from "./bits";
import {
  DashboardIcon,
  IssuesIcon,
  ProjectsIcon,
} from "./icons";
import { SettingsLink } from "./profile-menu";

export function Sidebar({
  projects,
  issueCount,
}: {
  projects: (ProjectRef & { count: number })[];
  issueCount: number;
}) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => setExpanded(false), [pathname]);
  const current = (href: string, exact = false) =>
    (exact ? pathname === href : pathname.startsWith(href))
      ? "page"
      : undefined;
  return (
    <aside
      className="sidebar"
      aria-label="Navigation"
      onKeyDown={(event) => {
        if (event.key === "Escape" && expanded) {
          setExpanded(false);
          toggle.current?.focus();
        }
      }}
    >
      <Link href="/issues" className="workspace-name">
        <img
          className="logo-mark"
          src="/logo.svg"
          alt=""
          width={22}
          height={22}
        />
        <span className="company-name">Muscle Memory</span>
      </Link>
      <button
        ref={toggle}
        className="nav-toggle"
        aria-expanded={expanded}
        aria-controls="workspace-nav"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? "Close menu" : "Menu"}
      </button>
      <nav
        id="workspace-nav"
        className={expanded ? "side-nav expanded" : "side-nav"}
        aria-label="Main navigation"
      >
        <Link
          className="side-link"
          href="/issues"
          aria-current={current("/issues")}
        >
          <IssuesIcon /> Explore <span className="count">{issueCount}</span>
        </Link>
        <Link
          className="side-link"
          href="/profile"
          aria-current={current("/profile")}
        >
          <DashboardIcon /> Profile
        </Link>
        <Link
          className="side-link"
          href="/projects"
          aria-current={current("/projects", true)}
        >
          <ProjectsIcon /> Projects
        </Link>
        <div className="side-heading">Projects</div>
        {projects.map((project) => (
          <Link
            key={project.slug}
            className="side-link project-link"
            href={projectHref(project)}
            aria-current={current(projectHref(project), true)}
          >
            <ProjectSquare project={project} /> {project.title}
            <span className="key">{project.key}</span>
          </Link>
        ))}
        <div className="spacer" />
        <SettingsLink />
      </nav>
    </aside>
  );
}
