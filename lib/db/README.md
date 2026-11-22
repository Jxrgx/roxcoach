# lib/db

Reservado para el acceso a datos (PostgreSQL + Prisma, fase futura).

Reglas:
- Ningún componente visual consulta la base de datos directamente.
- Las páginas obtendrán datos mediante funciones de esta carpeta, que
  reemplazarán a los datos ficticios de `lib/mock/`.
- El modelo previsto está documentado en `prisma/schema.prisma` (borrador).
