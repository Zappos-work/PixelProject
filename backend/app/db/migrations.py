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
    await connection.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_key VARCHAR(64)"))
    await connection.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_history JSONB"))
    await connection.execute(
        text("ALTER TABLE users ADD COLUMN IF NOT EXISTS holders_last_updated_at TIMESTAMPTZ")
    )
    await connection.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS holders_placed_total INTEGER"))
    await connection.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS claimed_pixels_count INTEGER"))
    await connection.execute(text("ALTER TABLE users ALTER COLUMN avatar_url TYPE TEXT"))
    await connection.execute(
        text("UPDATE users SET public_id = nextval('users_public_id_seq') WHERE public_id IS NULL")
    )
    await connection.execute(
        text("UPDATE users SET avatar_key = 'default-avatar' WHERE avatar_key IS NULL OR avatar_key <> 'custom-upload'")
    )
    await connection.execute(
        text("UPDATE users SET avatar_history = '[]'::jsonb WHERE avatar_history IS NULL")
    )
    await connection.execute(
        text("UPDATE users SET avatar_url = NULL WHERE avatar_url LIKE 'https://lh3.googleusercontent.com/%'")
    )
    await connection.execute(
        text("UPDATE users SET avatar_url = NULL WHERE avatar_url LIKE 'data:image/svg+xml%'")
    )
    await connection.execute(
        text("UPDATE users SET holders_last_updated_at = NOW() WHERE holders_last_updated_at IS NULL")
    )
    await connection.execute(
        text("UPDATE users SET holders_placed_total = 0 WHERE holders_placed_total IS NULL")
    )
    await connection.execute(
        text("UPDATE users SET claimed_pixels_count = 0 WHERE claimed_pixels_count IS NULL")
    )
    await connection.execute(
        text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_public_id ON users (public_id)")
    )
    await connection.execute(text("ALTER TABLE users ALTER COLUMN public_id SET NOT NULL"))
    await connection.execute(text("ALTER TABLE users ALTER COLUMN avatar_key SET NOT NULL"))
    await connection.execute(text("ALTER TABLE users ALTER COLUMN avatar_history SET NOT NULL"))
    await connection.execute(text("ALTER TABLE users ALTER COLUMN holders_last_updated_at SET NOT NULL"))
    await connection.execute(text("ALTER TABLE users ALTER COLUMN holders_placed_total SET NOT NULL"))
    await connection.execute(text("ALTER TABLE users ALTER COLUMN claimed_pixels_count SET NOT NULL"))
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

    await connection.execute(text("ALTER TABLE world_pixels ADD COLUMN IF NOT EXISTS is_starter BOOLEAN DEFAULT FALSE"))
    await connection.execute(text("ALTER TABLE world_pixels ALTER COLUMN owner_user_id DROP NOT NULL"))
    await connection.execute(text("ALTER TABLE world_pixels ALTER COLUMN color_id DROP NOT NULL"))
    await connection.execute(text("UPDATE world_pixels SET is_starter = FALSE WHERE is_starter IS NULL"))
    await connection.execute(text("ALTER TABLE world_pixels ALTER COLUMN is_starter SET NOT NULL"))
