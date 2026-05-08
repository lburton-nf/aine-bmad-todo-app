import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import type { CreateTodoRequest } from '../../../shared/types';

// Architecture invariant: X-User-Id matches /^anon-[0-9a-f-]{36}$/ exactly.
const USER_ID_REGEX = /^anon-[0-9a-f-]{36}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DESCRIPTION_MAX = 280;

function badRequest(reply: FastifyReply, message: string): FastifyReply {
  return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message });
}

function notFound(reply: FastifyReply, message: string): FastifyReply {
  return reply.code(404).send({ statusCode: 404, error: 'Not Found', message });
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

type PatchValidation = { ok: true; value: { completed: boolean } } | { ok: false; message: string };

function validatePatchBody(body: unknown): PatchValidation {
  if (body === null || body === undefined || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, message: 'Request body must be a JSON object' };
  }
  const obj = body as Record<string, unknown>;
  if (typeof obj.completed !== 'boolean') {
    return { ok: false, message: 'completed must be a boolean' };
  }
  // PATCH only mutates `completed`. Reject extras to surface client typos
  // (e.g. `description: 'x'`) instead of silently dropping them.
  for (const key of Object.keys(obj)) {
    if (key !== 'completed') {
      return { ok: false, message: `unexpected field: ${key}` };
    }
  }
  return { ok: true, value: { completed: obj.completed } };
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
  // Plugin-scoped preHandler — runs for every route registered in this plugin
  // (the four /todos verbs), and only for those. /healthz and any other
  // app-level routes are unaffected.
  app.addHook('preHandler', async (request, reply) => {
    const headerValue = request.headers['x-user-id'];
    if (Array.isArray(headerValue)) {
      return reply.code(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'X-User-Id header sent multiple times',
      });
    }
    const userId = typeof headerValue === 'string' ? headerValue : '';
    if (!USER_ID_REGEX.test(userId)) {
      return reply.code(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'X-User-Id header missing or malformed',
      });
    }
    request.userId = userId;
  });

  app.get('/todos', async (request) => {
    return app.db.listTodosForUser(request.userId);
  });

  app.post('/todos', async (request, reply) => {
    const body = validateCreateBody(request.body);
    if (!body.ok) return badRequest(reply, body.message);

    try {
      const todo = app.db.createTodo(request.userId, body.value);
      return reply.code(201).send(todo);
    } catch (err) {
      if (isPrimaryKeyViolation(err)) {
        return badRequest(reply, 'id already exists');
      }
      throw err;
    }
  });

  app.patch('/todos/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!UUID_REGEX.test(id)) {
      return badRequest(reply, 'id must be a lowercase canonical UUID string');
    }
    const body = validatePatchBody(request.body);
    if (!body.ok) return badRequest(reply, body.message);

    const updated = app.db.updateCompleted(request.userId, id, body.value.completed);
    if (updated === null) return notFound(reply, 'Todo not found');
    return reply.code(200).send(updated);
  });

  app.delete('/todos/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!UUID_REGEX.test(id)) {
      return badRequest(reply, 'id must be a lowercase canonical UUID string');
    }
    const removed = app.db.deleteTodo(request.userId, id);
    if (!removed) return notFound(reply, 'Todo not found');
    return reply.code(204).send();
  });

  app.delete('/todos', async (request, reply) => {
    app.db.deleteAllForUser(request.userId);
    return reply.code(204).send();
  });
};

export default todosRoutes;
