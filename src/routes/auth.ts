import { FastifyInstance } from 'fastify';
import { Octokit } from '@octokit/rest';
import { config } from '../config/env';
import { prisma } from '../lib/prisma';
import { createLogger } from '../config/logger';

const logger = createLogger('auth');

export async function authRoutes(server: FastifyInstance) {
  // Initiate GitHub OAuth flow
  server.get('/github', async (request, reply) => {
    const { installation_id } = request.query as { installation_id?: string };
    
    const state = Buffer.from(JSON.stringify({
      installation_id,
      timestamp: Date.now(),
    })).toString('base64');

    const params = new URLSearchParams({
      client_id: config.github.clientId,
      redirect_uri: `${config.urls.api}/api/auth/github/callback`,
      scope: 'read:user user:email',
      state,
    });

    return reply.redirect(302, `https://github.com/login/oauth/authorize?${params}`);
  });

  // GitHub OAuth callback
  server.get('/github/callback', async (request, reply) => {
    const { code, state } = request.query as { code: string; state: string };

    if (!code) {
      return reply.redirect(302, `${config.urls.app}/auth/error?message=No code provided`);
    }

    try {
      // Exchange code for token
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          client_id: config.github.clientId,
          client_secret: config.github.clientSecret,
          code,
        }),
      });

      const tokenData = await tokenResponse.json() as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
        error?: string;
      };

      if (tokenData.error) {
        logger.error({ error: tokenData.error }, 'OAuth token exchange failed');
        return reply.redirect(302, `${config.urls.app}/auth/error?message=${tokenData.error}`);
      }

      // Get user info
      const octokit = new Octokit({ auth: tokenData.access_token });
      const { data: user } = await octokit.users.getAuthenticated();

      // Save session
      const expiresAt = tokenData.expires_in 
        ? new Date(Date.now() + tokenData.expires_in * 1000)
        : null;

      const session = await prisma.userSession.upsert({
        where: { githubId: user.id },
        create: {
          githubId: user.id,
          username: user.login,
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          expiresAt,
        },
        update: {
          username: user.login,
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          expiresAt,
        },
      });

      // Parse state for installation_id
      let installationId: string | undefined;
      try {
        const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
        installationId = stateData.installation_id;
      } catch {}

      // Redirect to app with session
      const redirectParams = new URLSearchParams({
        session_id: session.id,
        ...(installationId && { installation_id: installationId }),
      });

      return reply.redirect(302, `${config.urls.app}/auth/callback?${redirectParams}`);
    } catch (error) {
      logger.error({ error }, 'OAuth callback failed');
      return reply.redirect(302, `${config.urls.app}/auth/error?message=Authentication failed`);
    }
  });

  // Get current user session
  server.get('/session', async (request, reply) => {
    const sessionId = request.headers['x-session-id'] as string;
    
    if (!sessionId) {
      return reply.status(401).send({ error: 'No session' });
    }

    const session = await prisma.userSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return reply.status(401).send({ error: 'Invalid session' });
    }

    // Check if expired
    if (session.expiresAt && session.expiresAt < new Date()) {
      // Try to refresh
      if (session.refreshToken) {
        try {
          const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify({
              client_id: config.github.clientId,
              client_secret: config.github.clientSecret,
              grant_type: 'refresh_token',
              refresh_token: session.refreshToken,
            }),
          });

          const tokenData = await tokenResponse.json() as {
            access_token: string;
            refresh_token?: string;
            expires_in?: number;
          };

          if (tokenData.access_token) {
            await prisma.userSession.update({
              where: { id: sessionId },
              data: {
                accessToken: tokenData.access_token,
                refreshToken: tokenData.refresh_token || session.refreshToken,
                expiresAt: tokenData.expires_in 
                  ? new Date(Date.now() + tokenData.expires_in * 1000)
                  : null,
              },
            });
          }
        } catch (error) {
          logger.warn({ error }, 'Token refresh failed');
          return reply.status(401).send({ error: 'Session expired' });
        }
      } else {
        return reply.status(401).send({ error: 'Session expired' });
      }
    }

    // Get user's installations
    const octokit = new Octokit({ auth: session.accessToken });
    const { data: installationsData } = await octokit.apps.listInstallationsForAuthenticatedUser();

    return {
      user: {
        id: session.githubId,
        username: session.username,
      },
      installations: installationsData.installations.map((i: any) => ({
        id: i.id,
        account: i.account?.login,
        accountType: i.account?.type,
      })),
    };
  });

  // Logout
  server.post('/logout', async (request, reply) => {
    const sessionId = request.headers['x-session-id'] as string;
    
    if (sessionId) {
      await prisma.userSession.delete({
        where: { id: sessionId },
      }).catch(() => {});
    }

    return { success: true };
  });

  // GitHub App installation URL
  server.get('/install-url', async (request, reply) => {
    return {
      url: `https://github.com/apps/${process.env.GITHUB_APP_SLUG || 'repopulse'}/installations/new`,
    };
  });

  // Get current user (alias for /session that frontend expects)
  server.get('/me', async (request, reply) => {
    const sessionId = request.headers['x-session-id'] as string;
    
    if (!sessionId) {
      return { user: null };
    }

    const session = await prisma.userSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return { user: null };
    }

    // Check if expired
    if (session.expiresAt && session.expiresAt < new Date()) {
      return { user: null };
    }

    return {
      user: {
        login: session.username,
        avatarUrl: `https://github.com/${session.username}.png`,
      },
    };
  });
}
