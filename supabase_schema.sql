-- RESET TOTAL PARA CRM PROCESA-T (Sincronización v5.3)
-- ADVERTENCIA: Esto borrará los datos actuales de estas tablas.

-- 1. Eliminar tablas anteriores si existen (para forzar nombres en minúsculas)
DROP TABLE IF EXISTS public.reg_gastos CASCADE;
DROP TABLE IF EXISTS public.reg_viajes CASCADE;
DROP TABLE IF EXISTS public.usuarios CASCADE;

-- 2. Crear Tabla de Usuarios
CREATE TABLE public.usuarios (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    usuario TEXT NOT NULL,
    password TEXT, 
    rol TEXT,
    id_contacto TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Crear Tabla de Viajes
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

-- 4. Crear Tabla de Gastos
CREATE TABLE public.reg_gastos (
    id_gasto TEXT PRIMARY KEY,
    id_viaje TEXT REFERENCES public.reg_viajes(id_viaje) ON DELETE SET NULL,
    id_unidad TEXT,
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

-- Habilitar RLS
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reg_viajes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reg_gastos ENABLE ROW LEVEL SECURITY;

-- Políticas (Permisivas)
CREATE POLICY "Allow public read" ON public.reg_viajes FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.reg_viajes FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public read" ON public.reg_gastos FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.reg_gastos FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public read" ON public.usuarios FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.usuarios FOR INSERT WITH CHECK (true);
