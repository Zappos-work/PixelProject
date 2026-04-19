from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection


async def ensure_auth_schema(connection: AsyncConnection) -> None:
    await connection.execute(
        text("CREATE SEQUENCE IF NOT EXISTS users_public_id_seq START WITH 1 INCREMENT BY 1")
    )
    await connection.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS public_id INTEGER"))
    await connection.execute(
        text("ALTER TABLE users ALTER COLUMN public_id SET DEFAULT nextval('users_public_id_seq')")
    )
    await connection.execute(
        text("ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name_changed_at TIMESTAMPTZ")
    )
    await connection.execute(
        text("UPDATE users SET public_id = nextval('users_public_id_seq') WHERE public_id IS NULL")
    )
    await connection.execute(
        text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_public_id ON users (public_id)")
    )
    await connection.execute(text("ALTER TABLE users ALTER COLUMN public_id SET NOT NULL"))
    await connection.execute(
        text(
            """
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM users WHERE public_id IS NOT NULL) THEN
                    PERFORM setval('users_public_id_seq', (SELECT MAX(public_id) FROM users), true);
                ELSE
                    PERFORM setval('users_public_id_seq', 1, false);
                END IF;
            END
            $$;
            """
        )
    )
    await connection.execute(
        text(
            """
            UPDATE users
            SET display_name = 'Player'
            WHERE display_name_changed_at IS NULL
              AND COALESCE(NULLIF(TRIM(display_name), ''), '') <> 'Player'
            """
        )
    )
    await connection.execute(
        text(
            """
            UPDATE users
            SET avatar_url = NULL
            WHERE avatar_url LIKE 'https://lh3.googleusercontent.com/%'
            """
        )
    )
