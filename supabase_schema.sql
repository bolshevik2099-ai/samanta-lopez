-- Tablas para CRM Procesa-T (Migración desde AppSheet)

-- 1. Tabla de Usuarios
CREATE TABLE IF NOT EXISTS public.usuarios (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    usuario TEXT NOT NULL,
    password TEXT, -- Temporal para migración
    rol TEXT,
    id_contacto TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabla de Viajes
CREATE TABLE IF NOT EXISTS public.reg_viajes (
    "ID_Viaje" TEXT PRIMARY KEY,
    "Fecha" DATE NOT NULL DEFAULT CURRENT_DATE,
    "ID_Unidad" TEXT,
    "ID_Chofer" TEXT,
    "Cliente" TEXT,
    "Origen" TEXT,
    "Destino" TEXT,
    "Monto_Flete" NUMERIC(12,2) DEFAULT 0,
    "Estatus_Viaje" TEXT DEFAULT 'Pendiente',
    "Comision_Chofer" NUMERIC(12,2) DEFAULT 0,
    "Estatus_Pago" TEXT DEFAULT 'Pendiente',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabla de Gastos
CREATE TABLE IF NOT EXISTS public.reg_gastos (
    "ID_Gasto" TEXT PRIMARY KEY,
    "ID_Viaje" TEXT REFERENCES public.reg_viajes("ID_Viaje") ON DELETE SET NULL,
    "ID_Unidad" TEXT,
    "Fecha" DATE NOT NULL DEFAULT CURRENT_DATE,
    "Concepto" TEXT,
    "Monto" NUMERIC(12,2) DEFAULT 0,
    "Tipo_Pago" TEXT DEFAULT 'Efectivo',
    "ID_Chofer" TEXT,
    "Kmts_Anteriores" INTEGER DEFAULT 0,
    "Kmts_Actuales" INTEGER DEFAULT 0,
    "Kmts_Recorridos" INTEGER DEFAULT 0,
    "Litros_Rellenados" NUMERIC(10,2) DEFAULT 0,
    "Ticket_Foto" TEXT, 
    "Foto_tacometro" TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reg_viajes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reg_gastos ENABLE ROW LEVEL SECURITY;

-- Políticas
CREATE POLICY "Allow public read" ON public.reg_viajes FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.reg_viajes FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public read" ON public.reg_gastos FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.reg_gastos FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public read" ON public.usuarios FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.usuarios FOR INSERT WITH CHECK (true);
