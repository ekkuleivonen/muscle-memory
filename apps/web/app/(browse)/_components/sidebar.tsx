"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { projectHref, type ProjectRef } from "../../../lib/library";
import { ProjectSquare } from "./bits";
import { BoardCount } from "./board";
import {
  BoardIcon,
  DashboardIcon,
  IssuesIcon,
  ProjectsIcon,
  PullsIcon,
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
      aria-label="Workspace"
      onKeyDown={(event) => {
        if (event.key === "Escape" && expanded) {
          setExpanded(false);
          toggle.current?.focus();
        }
      }}
    >
      <Link href="/dashboard" className="workspace-name">
        <img
          className="logo-mark"
          src="/logo.svg"
          alt=""
          width={22}
          height={22}
        />
        <span className="company-name">Muscle Memory Inc.</span>
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
          href="/dashboard"
          aria-current={current("/dashboard")}
        >
          <DashboardIcon /> Dashboard
        </Link>
        <Link
          className="side-link"
          href="/board"
          aria-current={current("/board")}
        >
          <BoardIcon /> Board <BoardCount />
        </Link>
        <Link
          className="side-link"
          href="/issues"
          aria-current={current("/issues")}
        >
          <IssuesIcon /> Issues <span className="count">{issueCount}</span>
        </Link>
        <Link
          className="side-link"
          href="/pulls"
          aria-current={current("/pulls")}
        >
          <PullsIcon /> Pull requests
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
