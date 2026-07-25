# Procedimiento Operativo: Registro de Nuevo Empleado

## Objetivo
Establecer el paso a paso para la creación de un nuevo empleado en la plataforma Eye Staff, evitando la duplicidad de registros y asegurando la integridad de los datos de Recursos Humanos.

## Contexto
Se ha implementado una nueva validación en el sistema para prevenir la creación de perfiles duplicados. A partir de ahora, el sistema verificará automáticamente si la cédula ingresada ya existe en la base de datos de empleados antes de permitir continuar con el llenado de los demás campos.

## Procedimiento Paso a Paso

1. **Ingreso al Módulo de Empleados:**
   - Inicie sesión en Eye Staff con su cuenta de Administrador o RRHH.
   - Diríjase al módulo de **EMPLEADOS** en el menú principal.

2. **Apertura del Formulario de Registro:**
   - Haga clic en la sección **"Registro de nuevo empleado"** para desplegar los campos del formulario.

3. **Ingreso de Cédula (Paso Obligatorio y Prioritario):**
   - El primer dato que debe ingresar **obligatoriamente** es la **CÉDULA** del empleado.
   - Al terminar de escribir la cédula y hacer clic fuera del campo (o pasar al siguiente campo), el sistema realizará una validación automática.

4. **Validación del Sistema:**
   - **Escenario A (La cédula no existe):** Si el número de cédula es nuevo, el sistema no mostrará ninguna alerta y usted podrá continuar completando el resto del formulario (Nombre, Email, Teléfono, etc.) y proceder a "Guardar Empleado".
   - **Escenario B (La cédula ya existe):** Si el número de cédula ya pertenece a un empleado registrado:
     - El sistema emitirá una alerta visual indicando: `⚠️ EL EMPLEADO CON CÉDULA [Número] YA EXISTE`.
     - El campo de cédula se limpiará automáticamente.
     - **El sistema abrirá automáticamente la ficha de edición del empleado existente**, mostrando todos sus datos actuales.

5. **Revisión y Modificación (En caso de Escenario B):**
   - Una vez abierta la ficha del empleado existente, RRHH deberá revisar los datos actuales.
   - Si el empleado necesita ser reactivado, reasignado o sus datos actualizados (por ejemplo, cambio de perfil, cuenta bancaria, etc.), modifique los campos necesarios y haga clic en **"ACTUALIZAR DATOS DEL EMPLEADO"**.
   - No es necesario crear un perfil nuevo, manteniendo así un historial unificado del empleado en el sistema.

## Notas Adicionales
- La búsqueda de duplicados ignora puntos o espacios adicionales en la cédula (ej. "21.148.333" es tratado igual que "21148333").
- Si el empleado está en estado "INACTIVO" pero ya existía, el proceso lo detectará igualmente, permitiéndole a RRHH reactivar su perfil existente en lugar de crear uno nuevo.
