import type { FastifyPluginAsync, FastifyReply } from 'fastify';

// Architecture invariant: X-User-Id matches /^anon-[0-9a-f-]{36}$/ exactly.
// Story 2.4 will hoist this check into a global preHandler hook.
const USER_ID_REGEX = /^anon-[0-9a-f-]{36}$/;

function badRequest(reply: FastifyReply, message: string): FastifyReply {
  return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message });
}

const todosRoutes: FastifyPluginAsync = async (app) => {
  app.get('/todos', async (request, reply) => {
    const headerValue = request.headers['x-user-id'];
    if (Array.isArray(headerValue)) {
      // Duplicate X-User-Id headers — reject explicitly rather than silently
      // collapsing to a malformed-format 400.
      return badRequest(reply, 'X-User-Id header sent multiple times');
    }
    const userId = typeof headerValue === 'string' ? headerValue : '';
    if (!USER_ID_REGEX.test(userId)) {
      return badRequest(reply, 'X-User-Id header missing or malformed');
    }
    return app.db.listTodosForUser(userId);
  });
};

export default todosRoutes;
