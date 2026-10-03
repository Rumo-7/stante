import { Router } from 'express';
import { exigirPerfil } from '../../auth/middleware';
import { calcularRadar } from './radar';

export const radarRouter = Router();

// Gestor e inspetor: o inspetor só vê o risco das próprias demandas. O representante não vê a
// avaliação interna da equipe.
radarRouter.get('/', exigirPerfil('gestor', 'inspetor'), async (req, res) => {
  res.json(await calcularRadar(req.usuario!));
});
