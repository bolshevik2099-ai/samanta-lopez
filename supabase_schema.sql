-- MODIFICACIÓN SEGURA DEL ESQUEMA (Sincronización v5.4)
-- NOTA: Se han comentado los DROP TABLE para evitar pérdida accidental de datos.
-- Si necesitas borrar todo de nuevo, descomenta las líneas de abajo.

-- 1. Eliminar tablas (¡CUIDADO! Esto borra todos tus datos actuales)
-- DROP TABLE IF EXISTS public.reg_gastos CASCADE;
-- DROP TABLE IF EXISTS public.reg_viajes CASCADE;
-- DROP TABLE IF EXISTS public.usuarios CASCADE;
-- DROP TABLE IF EXISTS public.cat_choferes CASCADE; -- Añadido para la nueva tabla
-- DROP TABLE IF EXISTS public.cat_unidades CASCADE; -- Añadido para la nueva tabla

-- 2. Crear Tabla de Usuarios
CREATE TABLE public.usuarios (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    usuario TEXT NOT NULL,
    password TEXT, 
    rol TEXT,
    id_contacto TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Crear Tabla de Choferes
CREATE TABLE public.cat_choferes (
    id_chofer TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    licencia TEXT,
    telefono TEXT,
    id_unidad TEXT, -- Unidad asignada
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Crear Tabla de Viajes
CREATE TABLE public.reg_viajes (
    id_viaje TEXT PRIMARY KEY,
    fecha DATE NOT NULL DEFAULT CURRENT_DATE,
    id_unidad TEXT,
    id_chofer TEXT,
    cliente TEXT,
    origen TEXT,
    destino TEXT,
    monto_flete NUMERIC(12,2) DEFAULT 0,
    estatus_viaje TEXT DEFAULT 'Pendiente',
    comision_chofer NUMERIC(12,2) DEFAULT 0,
    estatus_pago TEXT DEFAULT 'Pendiente',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Crear Tabla de Gastos
CREATE TABLE public.reg_gastos (
    id_gasto TEXT PRIMARY KEY,
    id_viaje TEXT, -- Removida FK para flexibilidad tipo Excel/AppSheet
    id_unidad TEXT, -- Corregido para coincidir con lo que el código podría esperar (opcional)
    fecha DATE NOT NULL DEFAULT CURRENT_DATE,
    concepto TEXT,
    monto NUMERIC(12,2) DEFAULT 0,
    tipo_pago TEXT DEFAULT 'Efectivo',
    id_chofer TEXT,
    kmts_anteriores INTEGER DEFAULT 0,
    kmts_actuales INTEGER DEFAULT 0,
    kmts_recorridos INTEGER DEFAULT 0,
    litros_rellenados NUMERIC(10,2) DEFAULT 0,
    ticket_foto TEXT, 
    foto_tacometro TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Tabla de Unidades
CREATE TABLE public.cat_unidades (
    id_unidad TEXT PRIMARY KEY,
    nombre_unidad TEXT,
    placas TEXT,
    modelo TEXT,
    marca TEXT,
    id_chofer TEXT, -- Chofer asignado
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reg_viajes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reg_gastos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cat_choferes ENABLE ROW LEVEL SECURITY; -- Añadido para la nueva tabla
ALTER TABLE public.cat_unidades ENABLE ROW LEVEL SECURITY; -- Añadido para la nueva tabla

-- Políticas (Permisivas)
CREATE POLICY "Allow public read" ON public.reg_viajes FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.reg_viajes FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public read" ON public.reg_gastos FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.reg_gastos FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public read" ON public.usuarios FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.usuarios FOR INSERT WITH CHECK (true);
