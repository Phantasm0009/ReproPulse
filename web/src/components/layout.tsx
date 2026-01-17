'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  LayoutDashboard,
  GitBranch,
  Shield,
  Bell,
  Settings,
  BarChart3,
  Users,
  FileCode,
  Moon,
  Sun,
  LogOut,
  Menu,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useState } from 'react';

interface User {
  login: string;
  avatarUrl: string;
}

interface SidebarProps {
  user?: User | null;
  installationId?: string;
  onLogout?: () => void;
}

const navItems = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/dashboard/repositories', label: 'Repositories', icon: GitBranch },
  { href: '/dashboard/findings', label: 'Findings', icon: Shield },
  { href: '/dashboard/fixes', label: 'Fix History', icon: FileCode },
  { href: '/dashboard/benchmarks', label: 'Benchmarks', icon: BarChart3 },
  { href: '/dashboard/policies', label: 'Policies', icon: Settings },
  { href: '/dashboard/notifications', label: 'Notifications', icon: Bell },
  { href: '/dashboard/team', label: 'Team', icon: Users },
];

export function Sidebar({ user, installationId, onLogout }: SidebarProps) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        'flex flex-col h-screen border-r bg-card transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center gap-2">
            <Shield className="w-8 h-8 text-primary" />
            <span className="font-bold text-xl">RepoPulse</span>
          </Link>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto"
        >
          <Menu className="w-5 h-5" />
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-2">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <li key={item.href}>
                <Link
                  href={installationId ? `${item.href}?installation=${installationId}` : item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="p-2 border-t">
        <Button
          variant="ghost"
          size={collapsed ? 'icon' : 'default'}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className={cn('w-full', collapsed ? 'justify-center' : 'justify-start')}
        >
          {theme === 'dark' ? (
            <>
              <Sun className="w-5 h-5" />
              {!collapsed && <span className="ml-2">Light Mode</span>}
            </>
          ) : (
            <>
              <Moon className="w-5 h-5" />
              {!collapsed && <span className="ml-2">Dark Mode</span>}
            </>
          )}
        </Button>

        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className={cn('w-full mt-2', collapsed ? 'justify-center' : 'justify-start')}
              >
                <Image
                  src={user.avatarUrl}
                  alt={user.login}
                  width={24}
                  height={24}
                  className="rounded-full"
                />
                {!collapsed && <span className="ml-2 truncate">{user.login}</span>}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem asChild>
                <Link href={`https://github.com/${user.login}`} target="_blank">
                  View GitHub Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onLogout} className="text-destructive">
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </aside>
  );
}

interface DashboardLayoutProps {
  children: React.ReactNode;
  user?: User | null;
  installationId?: string;
  onLogout?: () => void;
}

export function DashboardLayout({ children, user, installationId, onLogout }: DashboardLayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={user} installationId={installationId} onLogout={onLogout} />
      <main className="flex-1 overflow-y-auto bg-background">
        <div className="container mx-auto p-6">{children}</div>
      </main>
    </div>
  );
}
