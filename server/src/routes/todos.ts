import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import type { CreateTodoRequest } from '../../../shared/types';

// Architecture invariant: X-User-Id matches /^anon-[0-9a-f-]{36}$/ exactly.
// Story 2.4 will hoist this check into a global preHandler hook.
const USER_ID_REGEX = /^anon-[0-9a-f-]{36}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DESCRIPTION_MAX = 280;

function badRequest(reply: FastifyReply, message: string): FastifyReply {
  return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message });
}

function extractUserId(headerValue: string | string[] | undefined):
  | {
      ok: true;
      value: string;
    }
  | {
      ok: false;
      message: string;
    } {
  if (Array.isArray(headerValue)) {
    return { ok: false, message: 'X-User-Id header sent multiple times' };
  }
  const userId = typeof headerValue === 'string' ? headerValue : '';
  if (!USER_ID_REGEX.test(userId)) {
    return { ok: false, message: 'X-User-Id header missing or malformed' };
  }
  return { ok: true, value: userId };
}

type CreateValidation = { ok: true; value: CreateTodoRequest } | { ok: false; message: string };

function validateCreateBody(body: unknown): CreateValidation {
  // Arrays satisfy `typeof === 'object'` — exclude them explicitly so callers
  // get the accurate "must be a JSON object" message rather than a misleading
  // downstream id-validation error.
  if (body === null || body === undefined || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, message: 'Request body must be a JSON object' };
  }
  const { id, description } = body as Record<string, unknown>;

  if (typeof id !== 'string' || !UUID_REGEX.test(id)) {
    return { ok: false, message: 'id must be a lowercase canonical UUID string' };
  }
  if (typeof description !== 'string') {
    return { ok: false, message: 'description must be a string' };
  }
  const trimmed = description.trim();
  if (trimmed.length === 0) {
    return { ok: false, message: 'description must not be empty' };
  }
  if (description.length > DESCRIPTION_MAX) {
    return {
      ok: false,
      message: `description must be at most ${DESCRIPTION_MAX} characters`,
    };
  }
  return { ok: true, value: { id, description } };
}

function isPrimaryKeyViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'SQLITE_CONSTRAINT_PRIMARYKEY'
  );
}

const todosRoutes: FastifyPluginAsync = async (app) => {
  app.get('/todos', async (request, reply) => {
    const auth = extractUserId(request.headers['x-user-id']);
    if (!auth.ok) return badRequest(reply, auth.message);
    return app.db.listTodosForUser(auth.value);
  });

  app.post('/todos', async (request, reply) => {
    const auth = extractUserId(request.headers['x-user-id']);
    if (!auth.ok) return badRequest(reply, auth.message);

    const body = validateCreateBody(request.body);
    if (!body.ok) return badRequest(reply, body.message);

    try {
      const todo = app.db.createTodo(auth.value, body.value);
      return reply.code(201).send(todo);
    } catch (err) {
      if (isPrimaryKeyViolation(err)) {
        return badRequest(reply, 'id already exists');
      }
      throw err;
    }
  });
};

export default todosRoutes;
