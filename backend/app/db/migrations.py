from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app.core.config import get_settings


async def ensure_auth_schema(connection: AsyncConnection) -> None:
    settings = get_settings()

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
    await connection.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS holders_unlimited BOOLEAN"))
    await connection.execute(
        text("ALTER TABLE users ADD COLUMN IF NOT EXISTS holders_last_updated_at TIMESTAMPTZ")
    )
    await connection.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS claim_area_limit INTEGER"))
    await connection.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS normal_pixels INTEGER"))
    await connection.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS normal_pixel_limit INTEGER"))
    await connection.execute(
        text("ALTER TABLE users ADD COLUMN IF NOT EXISTS normal_pixels_last_updated_at TIMESTAMPTZ")
    )
    await connection.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS holders_placed_total INTEGER"))
    await connection.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS claimed_pixels_count INTEGER"))
    await connection.execute(text("ALTER TABLE users ALTER COLUMN holders_unlimited SET DEFAULT TRUE"))
    await connection.execute(text("ALTER TABLE users ALTER COLUMN claim_area_limit SET DEFAULT 1"))
    await connection.execute(text("ALTER TABLE users ALTER COLUMN normal_pixels SET DEFAULT 64"))
    await connection.execute(text("ALTER TABLE users ALTER COLUMN normal_pixel_limit SET DEFAULT 64"))
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
    await connection.execute(text("UPDATE users SET holders_unlimited = TRUE WHERE holders_unlimited IS NULL"))
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
        text("UPDATE users SET claim_area_limit = 1 WHERE claim_area_limit IS NULL OR claim_area_limit < 1")
    )
    await connection.execute(
        text("UPDATE users SET normal_pixels = 64 WHERE normal_pixels IS NULL OR normal_pixels < 0")
    )
    await connection.execute(
        text("UPDATE users SET normal_pixel_limit = 64 WHERE normal_pixel_limit IS NULL OR normal_pixel_limit < 0")
    )
    await connection.execute(text("UPDATE users SET normal_pixels = LEAST(normal_pixels, normal_pixel_limit)"))
    await connection.execute(
        text("UPDATE users SET normal_pixels_last_updated_at = NOW() WHERE normal_pixels_last_updated_at IS NULL")
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
    await connection.execute(text("ALTER TABLE users ALTER COLUMN holders_unlimited SET NOT NULL"))
    await connection.execute(text("ALTER TABLE users ALTER COLUMN holders_last_updated_at SET NOT NULL"))
    await connection.execute(text("ALTER TABLE users ALTER COLUMN claim_area_limit SET NOT NULL"))
    await connection.execute(text("ALTER TABLE users ALTER COLUMN normal_pixels SET NOT NULL"))
    await connection.execute(text("ALTER TABLE users ALTER COLUMN normal_pixel_limit SET NOT NULL"))
    await connection.execute(text("ALTER TABLE users ALTER COLUMN normal_pixels_last_updated_at SET NOT NULL"))
    await connection.execute(text("ALTER TABLE users ALTER COLUMN holders_placed_total SET NOT NULL"))
    await connection.execute(text("ALTER TABLE users ALTER COLUMN claimed_pixels_count SET NOT NULL"))
    await connection.execute(
        text("ALTER TABLE area_contributors ADD COLUMN IF NOT EXISTS role VARCHAR(16)")
    )
    await connection.execute(
        text("UPDATE area_contributors SET role = 'member' WHERE role IS NULL OR role NOT IN ('member', 'admin')")
    )
    await connection.execute(text("ALTER TABLE area_contributors ALTER COLUMN role SET DEFAULT 'member'"))
    await connection.execute(text("ALTER TABLE area_contributors ALTER COLUMN role SET NOT NULL"))
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
        text("ALTER TABLE world_chunks ADD COLUMN IF NOT EXISTS claimed_pixels_count INTEGER DEFAULT 0")
    )
    await connection.execute(
        text("ALTER TABLE world_chunks ADD COLUMN IF NOT EXISTS painted_pixels_count INTEGER DEFAULT 0")
    )
    await connection.execute(text("ALTER TABLE world_pixels ADD COLUMN IF NOT EXISTS is_starter BOOLEAN DEFAULT FALSE"))
    await connection.execute(
        text("UPDATE world_chunks SET claimed_pixels_count = 0 WHERE claimed_pixels_count IS NULL")
    )
    await connection.execute(
        text("UPDATE world_chunks SET painted_pixels_count = 0 WHERE painted_pixels_count IS NULL")
    )
    await connection.execute(
        text(
            """
            DO $$
            DECLARE
                current_chunk_claims BIGINT;
            BEGIN
                SELECT COALESCE(SUM(claimed_pixels_count), 0)
                INTO current_chunk_claims
                FROM world_chunks;

                IF current_chunk_claims = 0
                   AND EXISTS (
                       SELECT 1
                       FROM world_pixels
                       WHERE owner_user_id IS NOT NULL
                         AND is_starter IS FALSE
                       LIMIT 1
                   )
                THEN
                    WITH counts AS (
                        SELECT chunk_x, chunk_y, COUNT(*)::integer AS claimed_count
                        FROM world_pixels
                        WHERE owner_user_id IS NOT NULL
                          AND is_starter IS FALSE
                        GROUP BY chunk_x, chunk_y
                    )
                    UPDATE world_chunks
                    SET claimed_pixels_count = counts.claimed_count
                    FROM counts
                    WHERE world_chunks.chunk_x = counts.chunk_x
                      AND world_chunks.chunk_y = counts.chunk_y;
                END IF;
            END
            $$;
            """
        )
    )
    await connection.execute(text("ALTER TABLE world_chunks ALTER COLUMN claimed_pixels_count SET DEFAULT 0"))
    await connection.execute(text("ALTER TABLE world_chunks ALTER COLUMN claimed_pixels_count SET NOT NULL"))
    await connection.execute(text("ALTER TABLE world_chunks ALTER COLUMN painted_pixels_count SET DEFAULT 0"))
    await connection.execute(text("ALTER TABLE world_chunks ALTER COLUMN painted_pixels_count SET NOT NULL"))
    if (
        settings.world_origin_x == -(settings.world_chunk_size // 2)
        and settings.world_origin_y == -(settings.world_chunk_size // 2)
    ):
        is_legacy_origin = await connection.scalar(
            text(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM world_chunks
                    WHERE chunk_x = 0
                      AND chunk_y = 0
                      AND origin_x = 0
                      AND origin_y = 0
                )
                """
            )
        )

        if is_legacy_origin:
            chunk_offset = 1000000
            half_chunk = settings.world_chunk_size // 2

            await connection.execute(text("SET LOCAL maintenance_work_mem = '512MB'"))
            await connection.execute(text("ALTER TABLE world_pixels DROP CONSTRAINT IF EXISTS uq_world_pixels_xy"))
            await connection.execute(text("DROP INDEX IF EXISTS ix_world_pixels_x"))
            await connection.execute(text("DROP INDEX IF EXISTS ix_world_pixels_y"))
            await connection.execute(text("DROP INDEX IF EXISTS ix_world_pixels_chunk_x"))
            await connection.execute(text("DROP INDEX IF EXISTS ix_world_pixels_chunk_y"))
            await connection.execute(text("DROP INDEX IF EXISTS ix_world_pixels_growth_claimed_chunk"))
            await connection.execute(text("DROP INDEX IF EXISTS ix_world_pixels_tile_paint_xy"))
            await connection.execute(text("DROP INDEX IF EXISTS ix_world_pixels_tile_claim_xy"))
            await connection.execute(
                text(
                    """
                    UPDATE world_pixels
                    SET
                        x = x - :half_chunk,
                        y = (:half_chunk - 1) - y,
                        chunk_x = FLOOR((((x - :half_chunk) - :origin_x)::numeric / :chunk_size))::integer,
                        chunk_y = FLOOR(((((:half_chunk - 1) - y) - :origin_y)::numeric / :chunk_size))::integer
                    """
                ),
                {
                    "half_chunk": half_chunk,
                    "origin_x": settings.world_origin_x,
                    "origin_y": settings.world_origin_y,
                    "chunk_size": settings.world_chunk_size,
                },
            )
            await connection.execute(
                text(
                    """
                    DELETE FROM world_pixels
                    WHERE owner_user_id IS NULL
                      AND color_id IS NULL
                      AND is_starter IS TRUE
                      AND (x <> 0 OR y <> 0)
                    """
                )
            )
            await connection.execute(text("ALTER TABLE world_pixels ADD CONSTRAINT uq_world_pixels_xy UNIQUE (x, y)"))
            await connection.execute(text("CREATE INDEX IF NOT EXISTS ix_world_pixels_x ON world_pixels (x)"))
            await connection.execute(text("CREATE INDEX IF NOT EXISTS ix_world_pixels_y ON world_pixels (y)"))
            await connection.execute(text("CREATE INDEX IF NOT EXISTS ix_world_pixels_chunk_x ON world_pixels (chunk_x)"))
            await connection.execute(text("CREATE INDEX IF NOT EXISTS ix_world_pixels_chunk_y ON world_pixels (chunk_y)"))
            await connection.execute(
                text("UPDATE world_chunks SET chunk_y = chunk_y + :chunk_offset"),
                {"chunk_offset": chunk_offset},
            )
            await connection.execute(
                text("UPDATE world_chunks SET chunk_y = -(chunk_y - :chunk_offset)"),
                {"chunk_offset": chunk_offset},
            )
            await connection.execute(
                text(
                    """
                    UPDATE world_chunks
                    SET
                        origin_x = :origin_x + chunk_x * :chunk_size,
                        origin_y = :origin_y + chunk_y * :chunk_size
                    """
                ),
                {
                    "origin_x": settings.world_origin_x,
                    "origin_y": settings.world_origin_y,
                    "chunk_size": settings.world_chunk_size,
                },
            )
            await connection.execute(text("UPDATE world_chunks SET claimed_pixels_count = 0"))
            await connection.execute(
                text(
                    """
                    WITH counts AS (
                        SELECT chunk_x, chunk_y, COUNT(*)::integer AS claimed_count
                        FROM world_pixels
                        WHERE owner_user_id IS NOT NULL
                          AND is_starter IS FALSE
                        GROUP BY chunk_x, chunk_y
                    )
                    UPDATE world_chunks
                    SET claimed_pixels_count = counts.claimed_count
                    FROM counts
                    WHERE world_chunks.chunk_x = counts.chunk_x
                      AND world_chunks.chunk_y = counts.chunk_y
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
    await connection.execute(text("ALTER TABLE world_pixels ADD COLUMN IF NOT EXISTS area_id UUID"))
    await connection.execute(
        text("CREATE SEQUENCE IF NOT EXISTS claim_areas_public_id_seq START WITH 1 INCREMENT BY 1")
    )
    await connection.execute(text("ALTER TABLE claim_areas ADD COLUMN IF NOT EXISTS public_id INTEGER"))
    await connection.execute(
        text("ALTER TABLE claim_areas ALTER COLUMN public_id SET DEFAULT nextval('claim_areas_public_id_seq')")
    )
    await connection.execute(
        text(
            """
            WITH existing AS (
                SELECT COALESCE(MAX(public_id), 0) AS base
                FROM claim_areas
                WHERE public_id IS NOT NULL
            ),
            numbered AS (
                SELECT
                    claim_areas.id,
                    existing.base + ROW_NUMBER() OVER (ORDER BY claim_areas.created_at, claim_areas.id)::integer AS public_id
                FROM claim_areas
                CROSS JOIN existing
                WHERE claim_areas.public_id IS NULL
            )
            UPDATE claim_areas
            SET public_id = numbered.public_id
            FROM numbered
            WHERE claim_areas.id = numbered.id
            """
        )
    )
    await connection.execute(
        text("CREATE UNIQUE INDEX IF NOT EXISTS ix_claim_areas_public_id ON claim_areas (public_id)")
    )
    await connection.execute(text("ALTER TABLE claim_areas ALTER COLUMN public_id SET NOT NULL"))
    await connection.execute(
        text("UPDATE claim_areas SET name = LEFT(name, 20) WHERE char_length(name) > 20")
    )
    await connection.execute(
        text("UPDATE claim_areas SET description = LEFT(description, 250) WHERE char_length(description) > 250")
    )
    await connection.execute(text("ALTER TABLE claim_areas ALTER COLUMN name TYPE VARCHAR(20)"))
    await connection.execute(text("ALTER TABLE claim_areas ALTER COLUMN description TYPE VARCHAR(250)"))
    await connection.execute(
        text(
            """
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM claim_areas WHERE public_id IS NOT NULL) THEN
                    PERFORM setval('claim_areas_public_id_seq', (SELECT MAX(public_id) FROM claim_areas), true);
                ELSE
                    PERFORM setval('claim_areas_public_id_seq', 1, false);
                END IF;
            END
            $$;
            """
        )
    )
    await connection.execute(text("ALTER TABLE claim_areas ADD COLUMN IF NOT EXISTS status VARCHAR(16)"))
    await connection.execute(text("ALTER TABLE world_pixels ALTER COLUMN owner_user_id DROP NOT NULL"))
    await connection.execute(text("ALTER TABLE world_pixels ALTER COLUMN color_id DROP NOT NULL"))
    await connection.execute(text("UPDATE claim_areas SET status = 'active' WHERE status = 'draft'"))
    await connection.execute(text("UPDATE claim_areas SET status = 'finished' WHERE status = 'final'"))
    await connection.execute(text("UPDATE claim_areas SET status = 'finished' WHERE status IS NULL OR status NOT IN ('active', 'finished')"))
    await connection.execute(text("ALTER TABLE claim_areas ALTER COLUMN status SET DEFAULT 'active'"))
    await connection.execute(text("ALTER TABLE claim_areas ALTER COLUMN status SET NOT NULL"))
    await connection.execute(
        text(
            """
            DELETE FROM world_pixels AS pixel
            USING claim_areas AS area
            WHERE pixel.area_id = area.id
              AND area.status = 'finished'
              AND COALESCE(pixel.is_starter, FALSE) IS FALSE
              AND pixel.color_id IS NULL
            """
        )
    )
    await connection.execute(text("UPDATE claim_areas SET claimed_pixels_count = 0, painted_pixels_count = 0"))
    await connection.execute(
        text(
            """
            WITH counts AS (
                SELECT
                    area_id,
                    COUNT(*)::integer AS claimed_count,
                    COUNT(*) FILTER (WHERE color_id IS NOT NULL)::integer AS painted_count
                FROM world_pixels
                WHERE area_id IS NOT NULL
                  AND COALESCE(is_starter, FALSE) IS FALSE
                GROUP BY area_id
            )
            UPDATE claim_areas
            SET
                claimed_pixels_count = counts.claimed_count,
                painted_pixels_count = counts.painted_count
            FROM counts
            WHERE claim_areas.id = counts.area_id
            """
        )
    )
    await connection.execute(text("UPDATE users SET claimed_pixels_count = 0"))
    await connection.execute(
        text(
            """
            WITH counts AS (
                SELECT owner_user_id, COUNT(*)::integer AS claimed_count
                FROM world_pixels
                WHERE owner_user_id IS NOT NULL
                  AND COALESCE(is_starter, FALSE) IS FALSE
                GROUP BY owner_user_id
            )
            UPDATE users
            SET claimed_pixels_count = counts.claimed_count
            FROM counts
            WHERE users.id = counts.owner_user_id
            """
        )
    )
    await connection.execute(text("UPDATE world_chunks SET claimed_pixels_count = 0"))
    await connection.execute(text("UPDATE world_chunks SET painted_pixels_count = 0"))
    await connection.execute(
        text(
            """
            WITH counts AS (
                SELECT chunk_x, chunk_y, COUNT(*)::integer AS claimed_count
                FROM world_pixels
                WHERE owner_user_id IS NOT NULL
                  AND COALESCE(is_starter, FALSE) IS FALSE
                GROUP BY chunk_x, chunk_y
            )
            UPDATE world_chunks
            SET claimed_pixels_count = counts.claimed_count
            FROM counts
            WHERE world_chunks.chunk_x = counts.chunk_x
              AND world_chunks.chunk_y = counts.chunk_y
            """
        )
    )
    await connection.execute(
        text(
            """
            WITH counts AS (
                SELECT chunk_x, chunk_y, COUNT(*)::integer AS painted_count
                FROM world_pixels
                WHERE owner_user_id IS NOT NULL
                  AND COALESCE(is_starter, FALSE) IS FALSE
                  AND color_id IS NOT NULL
                GROUP BY chunk_x, chunk_y
            )
            UPDATE world_chunks
            SET painted_pixels_count = counts.painted_count
            FROM counts
            WHERE world_chunks.chunk_x = counts.chunk_x
              AND world_chunks.chunk_y = counts.chunk_y
            """
        )
    )
    await connection.execute(text("UPDATE world_pixels SET is_starter = FALSE WHERE is_starter IS NULL"))
    await connection.execute(text("ALTER TABLE world_pixels ALTER COLUMN is_starter SET NOT NULL"))
    await connection.execute(
        text("CREATE INDEX IF NOT EXISTS ix_world_pixels_area_id ON world_pixels (area_id)")
    )
    await connection.execute(
        text(
            """
            CREATE INDEX IF NOT EXISTS ix_world_pixels_growth_claimed_chunk
            ON world_pixels (chunk_x, chunk_y)
            WHERE owner_user_id IS NOT NULL AND is_starter IS FALSE
            """
        )
    )
    await connection.execute(
        text(
            """
            CREATE INDEX IF NOT EXISTS ix_world_pixels_tile_paint_xy
            ON world_pixels (x, y)
            INCLUDE (color_id)
            WHERE color_id IS NOT NULL
            """
        )
    )
    await connection.execute(
        text(
            """
            CREATE INDEX IF NOT EXISTS ix_world_pixels_tile_claim_xy
            ON world_pixels (x, y)
            INCLUDE (owner_user_id, is_starter)
            WHERE owner_user_id IS NOT NULL OR is_starter IS TRUE
            """
        )
    )
    await connection.execute(
        text(
            """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conrelid = 'world_pixels'::regclass
                      AND confrelid = 'claim_areas'::regclass
                      AND contype = 'f'
                      AND conkey = ARRAY[
                          (
                              SELECT attnum
                              FROM pg_attribute
                              WHERE attrelid = 'world_pixels'::regclass
                                AND attname = 'area_id'
                          )
                      ]::smallint[]
                ) THEN
                    ALTER TABLE world_pixels
                    ADD CONSTRAINT fk_world_pixels_area_id_claim_areas
                    FOREIGN KEY (area_id) REFERENCES claim_areas(id) ON DELETE SET NULL;
                END IF;
            END
            $$;
            """
        )
    )
