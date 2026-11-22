# lib/auth

Reservado para la autenticación (fuera del alcance de la fase base).

Hoy `/login` y `/registro` solo validan el formulario en cliente y redirigen a la
vista previa del rol elegido usando `ROLE_HOME` de `lib/permissions`.
No hay sesiones, cookies ni contraseñas almacenadas.
