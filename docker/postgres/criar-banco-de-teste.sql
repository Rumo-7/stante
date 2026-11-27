-- Executado só na primeira vez que o volume é criado.
-- O stante_dev já vem do POSTGRES_DB; aqui criamos o banco separado dos testes,
-- que os testes de integração e E2E apagam a cada execução.
CREATE DATABASE stante_test;
